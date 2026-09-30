// Family Estate & Trip Planner — Supabase-backed port of the "Generational Wealth Scouting Portal".
// supabase-js v2.117.2 bundled locally (public/vendor/supabase.js) — no CDN dependency.
import { createClient } from './vendor/supabase.js';

const SUPABASE_URL = 'https://fdlzvjdseljajjkdmdbv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cxiQDJcEuavGrefWGKVFMg_8gV0CNth';
const MAX_PARTY = 20;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const state = {
  user: null, name: '',
  group: null, party: null, isLeader: false,
  members: [], properties: [], votes: [], tally: {}, suggestion: '',
  currency: 'USD', rates: null,
};
let currentModalPropertyId = null;
let dateCount = 0;

// ── UI helpers ──────────────────────────────────────────────────────────────
let toastTimer;
window.showToast = (message, type = 'success') => {
  const toast = $('toast'), icon = $('toast-icon');
  $('toast-message').textContent = message;
  icon.className = type === 'error' ? 'fas fa-exclamation-circle text-red-400' : 'fas fa-check-circle text-brand-gold';
  toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
};
const setLoadingText = (t) => { $('loading-text').textContent = t; };
const showLoading = (t) => { if (t) setLoadingText(t); $('loading-screen').classList.remove('hidden'); };
const hideLoading = () => $('loading-screen').classList.add('hidden');
const friendly = (m) => /invalid login credentials/i.test(m) ? 'Wrong password for that email.'
  : /already in a party/i.test(m) ? 'This account is already in a party.'
  : /party not found/i.test(m) ? 'That party no longer exists.'
  : /already in a group/i.test(m) ? 'This account is already in a circle.'
  : /group not found/i.test(m) ? 'No circle with that invite code.'
  : /join a group first/i.test(m) ? 'Join or create a circle first.'
  : /rate limit/i.test(m) ? 'Too many attempts — wait a minute and try again.' : m;

// ── Auth ────────────────────────────────────────────────────────────────────
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('auth-name').value.trim(), email = $('auth-email').value.trim(), password = $('auth-password').value;
  const btn = $('auth-btn'); btn.disabled = true; btn.textContent = 'Connecting…';
  try {
    let { error } = await sb.auth.signInWithPassword({ email, password });
    if (error && /invalid login credentials/i.test(error.message)) {
      if (!name) { showToast('First time? Add your full name to register.', 'error'); return; }
      const { data, error: e2 } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      if (e2) throw e2;
      if (!data.session) { showToast('Account created. Check your email to confirm, then sign in.'); return; }
    } else if (error) throw error;
    else if (name) {
      // Existing account signing in with a name typed: backfill it if none is saved yet.
      const { data: { user } } = await sb.auth.getUser();
      if (user && !user.user_metadata?.name) { await sb.auth.updateUser({ data: { name } }); state.name = name; $('display-user-name').textContent = name; }
    }
  } catch (err) { showToast(friendly(err.message), 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Continue'; }
});
window.signOut = () => sb.auth.signOut();

sb.auth.onAuthStateChange(async (_evt, session) => {
  state.user = session?.user ?? null;
  if (!state.user) {
    $('main-app').classList.add('hidden'); $('main-app').classList.remove('flex');
    $('party-modal').classList.add('hidden'); $('group-modal').classList.add('hidden');
    hideLoading(); $('auth-modal').classList.remove('hidden');
    return;
  }
  $('auth-modal').classList.add('hidden');
  state.name = state.user.user_metadata?.name || state.user.email;
  state.currency = state.user.user_metadata?.currency || (() => { try { return localStorage.getItem('currency'); } catch { return null; } })() || 'USD';
  $('currency-select').value = state.currency;
  showLoading('Checking family roster...');
  await checkAdmin();
  await loadGroup();
});

// ── Group (circle) ──────────────────────────────────────────────────────────
async function loadGroup() {
  const { data: group, error } = await sb.from('trip_groups').select('*').maybeSingle();
  if (error) { hideLoading(); return showToast(error.message, 'error'); }
  if (!group) { hideLoading(); $('party-modal').classList.add('hidden'); $('group-modal').classList.remove('hidden'); return; }
  state.group = group;
  $('group-modal').classList.add('hidden');
  await loadParty();
}
window.joinGroup = async () => {
  const code = $('group-code-input').value.trim();
  if (!code) return showToast('Enter the invite code.', 'error');
  const { error } = await sb.rpc('trip_join_group', { p_code: code });
  if (error) return showToast(friendly(error.message), 'error');
  showLoading('Joining circle...'); await loadGroup();
};
window.createGroup = async () => {
  const name = $('new-group-name').value.trim();
  if (!name) return showToast('Give your circle a name.', 'error');
  const { error } = await sb.rpc('trip_create_group', { p_name: name });
  if (error) return showToast(friendly(error.message), 'error');
  showLoading('Creating circle...'); await loadGroup();
};
window.copyGroupCode = async () => {
  try { await navigator.clipboard.writeText(state.group.code); showToast('Invite code copied.'); } catch { showToast(state.group.code); }
};

// ── Party ───────────────────────────────────────────────────────────────────
async function loadParty() {
  const { data: party, error } = await sb.from('trip_parties').select('*').maybeSingle();
  if (error) { hideLoading(); return showToast(error.message, 'error'); }
  if (!party) { hideLoading(); await loadExistingParties(); $('party-modal').classList.remove('hidden'); return; }
  state.party = party; state.isLeader = party.head_user_id === state.user.id;
  setLoadingText('Loading estates...');
  await Promise.all([loadMembers(), loadProperties(), loadVotes(), loadTally(), loadSuggestion(), loadRates()]);
  $('party-modal').classList.add('hidden');
  showApp();
}

async function loadExistingParties() {
  const dd = $('existing-parties-dropdown');
  dd.innerHTML = '<option value="">Loading parties...</option>';
  const { data, error } = await sb.rpc('trip_list_parties');
  if (error || !data?.length) { dd.innerHTML = '<option value="" disabled selected>No existing parties found. Please create one.</option>'; return; }
  dd.innerHTML = '<option value="" disabled selected>Select a party to join...</option>' +
    data.map(p => `<option value="${p.id}">${esc(p.name)} (Led by ${esc(p.leader_name)})</option>`).join('');
}
window.joinParty = async () => {
  const id = $('existing-parties-dropdown').value;
  if (!id) return showToast('Please select a party from the list.', 'error');
  const { error } = await sb.rpc('trip_join_party_by_id', { p_id: id });
  if (error) return showToast(friendly(error.message), 'error');
  showLoading('Joining party...'); await loadParty();
};
window.createParty = async () => {
  const name = $('new-party-name').value.trim();
  if (!name) return showToast('Please enter a name for your new party.', 'error');
  const { error } = await sb.rpc('trip_create_party', { p_name: name });
  if (error) return showToast(friendly(error.message), 'error');
  showLoading('Establishing party...'); await loadParty();
};

// ── App shell ───────────────────────────────────────────────────────────────
function showApp() {
  hideLoading();
  $('display-user-name').textContent = state.name;
  $('display-party-role').textContent = (state.isLeader ? 'Head of ' : 'Member of ') + state.party.name;
  $('display-group-name').textContent = state.group.name;
  $('site-title').textContent = `${state.group.name} — Annual Trip`;
  document.title = `${state.group.name} — Trip & Estate Scouting`;
  $('group-code').textContent = state.group.code;
  if (state.isLeader) {
    $('logistics-section').classList.remove('hidden-section');
    $('display-party-name').textContent = state.party.name;
    fillLogistics();
  } else {
    $('logistics-section').classList.add('hidden-section');
  }
  $('custom-suggestion').value = state.suggestion || '';
  renderPropertiesGrid();
  $('main-app').classList.remove('hidden'); $('main-app').classList.add('flex');
  showToast(`Welcome, ${state.name}.`);
}

// ── Logistics (leaders) ─────────────────────────────────────────────────────
const membersContainer = $('dynamic-members-container');
const partySizeInput = $('input-party-size');

function fillLogistics() {
  const p = state.party;
  partySizeInput.value = Math.max(1, state.members.length || 1);
  renderFamilyMembers(state.members);
  $('budget-total').value = p.budget_total ?? '';
  $('budget-pp').value = p.budget_per_person ?? '';
  $('budget-pd').value = p.budget_per_person_day ?? '';
  $('dates-container').innerHTML = ''; dateCount = 0;
  const ranges = Array.isArray(p.preferred_date_ranges) ? p.preferred_date_ranges : [];
  if (ranges.length) ranges.forEach(r => addDateRow(r.start, r.end)); else addDateRow();
  $('invest-interest').checked = !!p.cobuy_interest;
  toggleInvestmentFields(true);
  $('invest-capital').value = p.cobuy_capital_range ?? '';
  $('invest-income').value = p.cobuy_income_range ?? '';
}

window.adjustPartySize = (delta) => {
  let next = (parseInt(partySizeInput.value) || 1) + delta;
  partySizeInput.value = Math.min(MAX_PARTY, Math.max(1, next));
  renderFamilyMembers();
};

function renderFamilyMembers(seed) {
  const size = parseInt(partySizeInput.value) || 1;
  const existing = seed ? seed.map(m => ({ name: m.name ?? '', age: m.age ?? '', acc: m.needs ?? '' }))
    : [...document.querySelectorAll('.member-row')].map(row => ({
        name: row.querySelector('.mem-name').value, age: row.querySelector('.mem-age').value, acc: row.querySelector('.mem-acc').value }));
  let html = '';
  for (let i = 0; i < size; i++) {
    const prev = existing[i] || { name: i === 0 ? state.name : '', age: '', acc: '' };
    html += `
      <div class="member-row bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-3 items-start sm:items-center transition-all">
        <div class="bg-brand-navy text-brand-gold w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">${i + 1}</div>
        <div class="flex-grow grid grid-cols-1 sm:grid-cols-12 gap-2 w-full">
          <input type="text" class="mem-name sm:col-span-4 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:border-brand-gold" placeholder="Full Name" value="${esc(prev.name)}" required>
          <input type="number" class="mem-age sm:col-span-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:border-brand-gold" placeholder="Age" min="0" max="120" value="${esc(prev.age)}" required>
          <input type="text" class="mem-acc sm:col-span-6 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:border-brand-gold" placeholder="Diet, Mobility, etc." value="${esc(prev.acc)}">
        </div>
      </div>`;
  }
  membersContainer.innerHTML = html;
}

window.addDateRow = (start = '', end = '') => {
  dateCount++;
  const div = document.createElement('div');
  div.className = 'date-row flex items-center gap-2 bg-white p-1.5 border border-gray-200 rounded-lg shadow-sm';
  div.innerHTML = `
    <input type="date" class="date-start w-full px-2 py-1.5 text-sm bg-transparent outline-none focus:text-brand-navy text-gray-600" value="${esc(start)}">
    <span class="text-gray-300 font-bold px-1">→</span>
    <input type="date" class="date-end w-full px-2 py-1.5 text-sm bg-transparent outline-none focus:text-brand-navy text-gray-600" value="${esc(end)}">
    ${dateCount > 1 ? `<button type="button" onclick="this.parentElement.remove()" class="text-gray-300 hover:text-red-500 px-2 transition-colors"><i class="fas fa-times"></i></button>` : `<div class="w-7"></div>`}`;
  $('dates-container').appendChild(div);
};

window.toggleInvestmentFields = (keepValues = false) => {
  const on = $('invest-interest').checked, bg = $('invest-check-bg'), fields = $('investment-fields');
  bg.classList.toggle('scale-0', !on); bg.classList.toggle('scale-100', on);
  fields.classList.toggle('hidden', !on);
  if (!on && !keepValues) { $('invest-capital').value = ''; $('invest-income').value = ''; }
};

$('logistics-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.isLeader) return;
  const rows = [...document.querySelectorAll('.member-row')];
  const members = rows.map((row, i) => ({
    party_id: state.party.id, position: i + 1,
    name: row.querySelector('.mem-name').value.trim() || null,
    age: row.querySelector('.mem-age').value === '' ? null : +row.querySelector('.mem-age').value,
    needs: row.querySelector('.mem-acc').value.trim() || null,
  }));
  if (members.some(m => !m.name || m.age === null)) return showToast('Please fill out all member names and ages.', 'error');
  const dates = [...document.querySelectorAll('.date-row')]
    .map(r => ({ start: r.querySelector('.date-start').value, end: r.querySelector('.date-end').value }))
    .filter(d => d.start || d.end);
  const num = (v) => v === '' ? null : Number(v);
  const interested = $('invest-interest').checked;
  const upd = {
    budget_total: num($('budget-total').value),
    budget_per_person: num($('budget-pp').value),
    budget_per_person_day: num($('budget-pd').value),
    preferred_date_ranges: dates,
    cobuy_interest: interested,
    cobuy_capital_range: interested ? $('invest-capital').value || null : null,
    cobuy_income_range: interested ? $('invest-income').value || null : null,
  };

  const btn = $('submit-logistics-btn'), originalHTML = btn.innerHTML, originalClass = btn.className;
  btn.innerHTML = `<div class="spinner border-[2px] w-5 h-5 border-t-white border-white/30 mr-2"></div> Securing Data...`; btn.disabled = true;
  try {
    const { error: e1 } = await sb.from('trip_parties').update(upd).eq('id', state.party.id); if (e1) throw e1;
    const { error: e2 } = await sb.from('trip_party_members').delete().eq('party_id', state.party.id).gt('position', members.length); if (e2) throw e2;
    const { error: e3 } = await sb.from('trip_party_members').upsert(members, { onConflict: 'party_id,position' }); if (e3) throw e3;
    Object.assign(state.party, upd); await loadMembers();
    btn.innerHTML = `<i class="fas fa-check-double text-xl"></i> Logistics Secured`;
    btn.className = 'w-full bg-green-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg flex justify-center items-center gap-3 transition-all';
    showToast('Household logistics saved.');
    setTimeout(() => { btn.innerHTML = originalHTML; btn.className = originalClass; btn.disabled = false; }, 2500);
  } catch (err) {
    showToast(friendly(err.message), 'error'); btn.innerHTML = originalHTML; btn.className = originalClass; btn.disabled = false;
  }
});

// ── Currency ────────────────────────────────────────────────────────────────
// Rates are USD-based: rates[X] = how many X per 1 USD. Fallback = the research payload's planning conversions.
const FALLBACK_RATES = { USD: 1, EUR: 1 / 1.16, GBP: 1 / 1.33 };
async function loadRates() {
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,CAD,AUD,JPY,CHF,MXN', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(); state.rates = { USD: 1, ...j.rates }; state.ratesDate = j.date;
  } catch { state.rates = FALLBACK_RATES; state.ratesDate = null; }
}
const SYM = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥', CHF: 'CHF ', MXN: 'MX$' };
function convert(amount, from, to) {
  const r = state.rates || FALLBACK_RATES;
  if (!(from in r) || !(to in r)) return null;
  return amount / r[from] * r[to];
}
function money(amount, cur) {
  const digits = cur === 'JPY' ? 0 : (amount >= 1000 ? 0 : 2);
  return (SYM[cur] ?? cur + ' ') + amount.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
// Structured price → "≈ £2,960 / week (€3,500)"; falls back to the raw text when unstructured.
function priceLine(amount, cur, unit, rawText) {
  if (amount == null || !cur) return esc(rawText || '—');
  const unitTxt = unit ? ` / ${esc(unit)}` : '';
  if (cur === state.currency) return `${money(amount, cur)}${unitTxt}`;
  const c = convert(amount, cur, state.currency);
  if (c == null) return `${money(amount, cur)}${unitTxt}`;
  return `<span class="whitespace-nowrap">≈ ${money(c, state.currency)}${unitTxt}</span> <span class="text-gray-400 font-normal text-xs">(${money(amount, cur)})</span>`;
}
$('currency-select').addEventListener('change', async (e) => {
  state.currency = e.target.value;
  try { localStorage.setItem('currency', state.currency); } catch {}
  renderPropertiesGrid();
  if (currentModalPropertyId && !$('property-modal').classList.contains('hidden')) openPropertyModal(currentModalPropertyId);
  if (state.user) sb.auth.updateUser({ data: { currency: state.currency } });
});

// ── Estates & votes ─────────────────────────────────────────────────────────
const isBuyTarget = (p) => p.status === 'sale';
const myVote = (id) => state.votes.some(v => v.property_id === id && v.user_id === state.user.id);
const tally = (id) => state.tally[id] || 0;

function renderPropertiesGrid() {
  const grid = $('estates-grid');
  grid.innerHTML = state.properties.map(prop => {
    const voted = myVote(prop.id), n = tally(prop.id);
    const hero = prop.image || (prop.gallery || [])[0] || '';
    return `
      <div class="property-card glass-card rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full ${voted ? 'property-voted' : ''}" onclick="openPropertyModal('${prop.id}')" id="card-${prop.id}">
        <div class="h-44 relative overflow-hidden bg-gray-200">
          ${hero ? `<img src="${esc(hero)}" alt="${esc(prop.name)}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110">` : `<div class="w-full h-full flex items-center justify-center text-gray-400 text-sm"><i class="fas fa-image mr-2"></i>No photo yet</div>`}
          <div class="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm text-brand-navy">
            ${isBuyTarget(prop) ? '<i class="fas fa-key text-brand-gold mr-1"></i> Buy Target' : 'Rental Only'}
          </div>
          ${voted ? `<div class="absolute top-3 left-3 bg-brand-gold text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg"><i class="fas fa-check"></i></div>` : ''}
        </div>
        <div class="p-5 flex-grow flex flex-col">
          <h4 class="font-serif text-lg font-bold text-brand-navy mb-1">${esc(prop.name)}</h4>
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-3"><i class="fas fa-map-marker-alt text-brand-gold mr-1"></i> ${esc(prop.location)}</p>
          <p class="text-sm text-gray-600 mb-4 flex-grow line-clamp-2">${esc(prop.short_desc)}</p>
          <div class="grid grid-cols-2 gap-2 mt-auto pt-4 border-t border-gray-100">
            <div><span class="block text-[10px] uppercase text-gray-400 font-semibold">Capacity</span>
              <span class="text-sm font-medium text-brand-navy"><i class="fas fa-user-friends mr-1 text-gray-400 text-xs"></i>${esc(prop.capacity)}</span></div>
            <div><span class="block text-[10px] uppercase text-gray-400 font-semibold">Acreage</span>
              <span class="text-sm font-medium text-brand-navy"><i class="fas fa-tree mr-1 text-gray-400 text-xs"></i>${esc(prop.acreage)}</span></div>
          </div>
          <div class="mt-3 flex items-center justify-between text-[11px] text-gray-500">
            <span class="font-semibold text-brand-navy">${priceLine(prop.rental_amount, prop.rental_currency, prop.rental_unit, prop.rental_cost)}</span>
            <span><i class="fas fa-poll text-brand-gold mr-1"></i>${n} circle vote${n === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  $('vote-count').textContent = state.votes.filter(v => v.user_id === state.user.id).length;
}

window.openPropertyModal = (id) => {
  const prop = state.properties.find(p => p.id === id); if (!prop) return;
  currentModalPropertyId = id;
  $('modal-title').textContent = prop.name;
  $('modal-location').innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i> ${esc(prop.location)}`;
  $('modal-image').src = prop.image || (prop.gallery || [])[0] || '';
  $('modal-description').textContent = prop.full_desc || '';
  $('modal-extras')?.remove();
  $('modal-tags').innerHTML = `
    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-users text-brand-gold mr-1"></i> ${esc(prop.capacity)}</span>
    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-tree text-brand-gold mr-1"></i> ${esc(prop.acreage)}</span>
    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-home text-brand-gold mr-1"></i> ${isBuyTarget(prop) ? 'Acquisition Target' : 'Vacation Rental'}</span>`;
  $('modal-amenities').innerHTML = (prop.amenities || []).map(a => `<li class="flex items-center gap-2"><i class="fas fa-check text-brand-gold text-xs"></i> ${esc(a)}</li>`).join('');
  $('modal-financials').innerHTML = `
    <div class="pb-3 border-b border-gray-100/50"><div class="text-sm text-gray-600">Rental / Trial Stay</div><div class="font-bold text-brand-navy text-right">${priceLine(prop.rental_amount, prop.rental_currency, prop.rental_unit, prop.rental_cost)}</div>${prop.rental_amount != null ? `<div class="text-[11px] text-gray-400 mt-1">${esc(prop.rental_cost)}</div>` : ''}</div>
    <div class="pb-3 border-b border-gray-100/50"><div class="text-sm text-gray-600">Acquisition Price</div><div class="font-bold text-right ${isBuyTarget(prop) ? 'text-green-700' : 'text-gray-500'}">${priceLine(prop.buy_amount, prop.buy_currency, '', prop.buy_cost)}</div>${prop.buy_amount != null && prop.buy_cost ? `<div class="text-[11px] text-gray-400 mt-1">${esc(prop.buy_cost)}</div>` : ''}</div>
    <div class="flex justify-between items-center pb-3 border-b border-gray-100/50"><span class="text-sm text-gray-600">Circle votes</span><span class="font-bold text-brand-navy">${tally(prop.id)}</span></div>
    ${state.ratesDate ? `<div class="text-[10px] text-gray-400">Rates: ECB ${esc(state.ratesDate)}</div>` : `<div class="text-[10px] text-gray-400">Rates: planning estimates (live rates unavailable)</div>`}`;
  const link = prop.listing_url ? `<a href="${esc(prop.listing_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm font-semibold text-brand-navy underline decoration-brand-gold underline-offset-4 hover:text-brand-gold"><i class="fas fa-external-link-alt text-brand-gold"></i> View original listing</a>` : '';
  const gal = (prop.gallery || []).slice(0, 6).map(u => `<img src="${esc(u)}" class="h-20 w-full object-cover rounded-lg border border-gray-100 cursor-pointer" onclick="document.getElementById('modal-image').src=this.src">`).join('');
  $('modal-description').insertAdjacentHTML('afterend', `<div id="modal-extras" class="space-y-3">${gal ? `<div class="grid grid-cols-3 sm:grid-cols-6 gap-2">${gal}</div>` : ''}${link}</div>`);
  const wc = $('modal-warning-container');
  if (prop.risk) { $('modal-warning-text').textContent = prop.risk; wc.classList.remove('hidden'); } else wc.classList.add('hidden');
  updateModalVoteButtonState();
  const modal = $('property-modal'), content = $('property-modal-content');
  modal.classList.remove('hidden'); void modal.offsetWidth;
  modal.classList.remove('opacity-0'); content.classList.remove('scale-95');
};
window.closePropertyModal = () => {
  const modal = $('property-modal'), content = $('property-modal-content');
  modal.classList.add('opacity-0'); content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
};

window.toggleVoteCurrentProperty = async () => {
  const id = currentModalPropertyId; if (!id) return;
  const btn = $('modal-vote-btn'); btn.disabled = true;
  const had = myVote(id);
  const { error } = had
    ? await sb.from('trip_votes').delete().eq('user_id', state.user.id).eq('property_id', id)
    : await sb.from('trip_votes').insert({ party_id: state.party.id, user_id: state.user.id, property_id: id });
  btn.disabled = false;
  if (error) return showToast(/row-level security/i.test(error.message) ? 'Voting is locked for your party.' : error.message, 'error');
  showToast(had ? 'Vote removed.' : 'Property added to your votes!');
  await Promise.all([loadVotes(), loadTally()]); updateModalVoteButtonState(); renderPropertiesGrid();
  const cell = [...$('modal-financials').querySelectorAll('span')].find(s => s.previousElementSibling?.textContent === 'Circle votes');
  if (cell) cell.textContent = tally(id);
};

function updateModalVoteButtonState() {
  const btn = $('modal-vote-btn'), icon = $('modal-vote-icon'), text = $('modal-vote-text');
  if (myVote(currentModalPropertyId)) {
    btn.className = 'w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-brand-gold text-white shadow-lg shadow-brand-gold/30 hover:bg-[#b59045]';
    icon.className = 'fas fa-check-circle'; text.textContent = 'Voted for Estate';
  } else {
    btn.className = 'w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 border-2 border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-white';
    icon.className = 'far fa-heart'; text.textContent = 'Vote for this Estate';
  }
}

window.saveVotes = async () => {
  const suggestion = $('custom-suggestion').value.trim() || null;
  const btn = $('save-votes-btn'), originalHTML = btn.innerHTML;
  btn.innerHTML = 'Saving...'; btn.disabled = true;
  const { error } = await sb.from('trip_party_users').update({ suggestion }).eq('user_id', state.user.id);
  if (error) { showToast(error.message, 'error'); btn.innerHTML = originalHTML; btn.disabled = false; return; }
  state.suggestion = suggestion || '';
  showToast('Your votes and suggestions have been recorded!');
  btn.innerHTML = '<i class="fas fa-check"></i> Saved';
  setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 2000);
};

$('property-modal').addEventListener('click', (e) => { if (e.target.id === 'property-modal') closePropertyModal(); });

// ── Loaders ─────────────────────────────────────────────────────────────────
async function loadMembers() {
  const { data } = await sb.from('trip_party_members').select('*').eq('party_id', state.party.id).order('position');
  state.members = data ?? [];
}
async function loadProperties() {
  const { data } = await sb.from('trip_properties').select('*').order('sort');
  state.properties = data ?? [];
}
async function loadVotes() {
  const { data } = await sb.from('trip_votes').select('user_id, property_id').eq('party_id', state.party.id);
  state.votes = data ?? [];
}
async function loadTally() {
  const { data } = await sb.rpc('trip_group_tally');
  state.tally = Object.fromEntries((data ?? []).map(r => [r.property_id, Number(r.votes)]));
}
async function loadSuggestion() {
  const { data } = await sb.from('trip_party_users').select('suggestion').eq('user_id', state.user.id).maybeSingle();
  state.suggestion = data?.suggestion ?? '';
}

// ── Admin console ───────────────────────────────────────────────────────────
let adminData = null;
async function checkAdmin() {
  const { data } = await sb.rpc('trip_is_admin');
  state.isAdmin = !!data;
  $('admin-btn').classList.toggle('hidden', !state.isAdmin);
}
window.openAdmin = async () => { $('admin-modal').classList.remove('hidden'); await loadAdmin(); };
window.closeAdmin = () => $('admin-modal').classList.add('hidden');
$('admin-modal').addEventListener('click', (e) => { if (e.target.id === 'admin-modal') closeAdmin(); });

async function adminCall(fn, args, successMsg) {
  const { error } = await sb.rpc(fn, args);
  if (error) { showToast(friendly(error.message), 'error'); return false; }
  showToast(successMsg || 'Done.');
  await loadAdmin();
  // if the admin changed their own circle/party, reload the main app quietly
  if (['trip_admin_merge_groups','trip_admin_merge_parties','trip_admin_move_user'].includes(fn)) { await loadGroup(); }
  return true;
}

window.loadAdmin = async () => {
  $('admin-body').innerHTML = '<div class="text-gray-400 py-8 text-center"><div class="spinner mx-auto mb-3"></div>Loading…</div>';
  const { data, error } = await sb.rpc('trip_admin_overview');
  if (error) { $('admin-body').innerHTML = `<p class="text-red-600">${esc(friendly(error.message))}</p>`; return; }
  adminData = data; renderAdmin();
};

const when = (ts) => ts ? new Date(ts).toLocaleDateString() : 'never';
const groupOptions = (exceptId) => adminData.groups.filter(g => g.id !== exceptId).map(g => `<option value="${g.id}">${esc(g.name)} (${esc(g.code)})</option>`).join('');
const partyOptions = (groupId, exceptId) => adminData.groups.filter(g => !groupId || g.id === groupId).flatMap(g => g.parties.filter(p => p.id !== exceptId).map(p => `<option value="${p.id}">${esc(g.name)} › ${esc(p.name)}</option>`)).join('');

function userRow(u, ctx) {
  const parties = adminData.groups.flatMap(g => g.parties.map(p => ({ gid: g.id, gname: g.name, pid: p.id, pname: p.name })));
  return `
    <tr class="border-t border-gray-100 align-top">
      <td class="py-2 pr-3">
        <div class="font-semibold text-brand-navy">${esc(u.name || '—')} ${ctx.role === 'head' ? '<span class="ml-1 text-[10px] bg-brand-gold text-white px-1.5 py-0.5 rounded">HEAD</span>' : ''}</div>
        <div class="text-xs text-gray-500 break-all">${esc(u.email)}</div>
        <div class="text-[11px] text-gray-400">last sign-in ${when(u.last_sign_in)}${u.votes != null ? ` · ${u.votes} vote${u.votes === 1 ? '' : 's'}` : ''}</div>
        ${u.suggestion ? `<div class="text-[11px] text-gray-500 mt-1"><i class="fas fa-link text-brand-gold mr-1"></i>${esc(u.suggestion)}</div>` : ''}
      </td>
      <td class="py-2 text-right whitespace-nowrap">
        <div class="flex flex-wrap gap-1 justify-end">
          <select class="text-xs border border-gray-200 rounded px-1.5 py-1 max-w-[12rem]" onchange="if(this.value){adminMove('${u.user_id}', this.value)}">
            <option value="">Move to…</option>
            ${adminData.groups.map(g => `<optgroup label="${esc(g.name)}"><option value="${g.id}|">${esc(g.name)} (no household yet)</option>${g.parties.map(p => `<option value="${g.id}|${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}
          </select>
          ${ctx.pid && ctx.role !== 'head' ? `<button class="adm-btn" onclick="adminCall('trip_admin_set_head',{p_party:'${ctx.pid}',p_user:'${u.user_id}'},'Head of household updated.')" title="Make head of household"><i class="fas fa-crown"></i></button>` : ''}
          <button class="adm-btn" onclick="adminRenameUser('${u.user_id}','${esc(u.name || '')}')" title="Fix name"><i class="fas fa-pen"></i></button>
          <button class="adm-btn" onclick="adminPassword('${u.user_id}','${esc(u.email)}')" title="Set a temporary password"><i class="fas fa-key"></i></button>
          <button class="adm-btn text-red-600" onclick="adminDeleteUser('${u.user_id}','${esc(u.email)}')" title="Delete this account"><i class="fas fa-user-times"></i></button>
        </div>
      </td>
    </tr>`;
}

function renderAdmin() {
  const d = adminData;
  const style = `<style>.adm-btn{border:1px solid #e5e7eb;border-radius:.375rem;padding:.25rem .5rem;font-size:.7rem;background:#fff}.adm-btn:hover{background:#f8fafc}</style>`;
  const totalUsers = d.groups.reduce((n, g) => n + Number(g.members), 0) + d.orphans.length;
  let html = style + `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-brand-lightgold/60 rounded-xl p-3"><div class="text-[10px] uppercase text-gray-500 font-semibold">Circles</div><div class="text-2xl font-bold text-brand-navy">${d.groups.length}</div></div>
      <div class="bg-brand-lightgold/60 rounded-xl p-3"><div class="text-[10px] uppercase text-gray-500 font-semibold">Households</div><div class="text-2xl font-bold text-brand-navy">${d.groups.reduce((n, g) => n + g.parties.length, 0)}</div></div>
      <div class="bg-brand-lightgold/60 rounded-xl p-3"><div class="text-[10px] uppercase text-gray-500 font-semibold">Accounts</div><div class="text-2xl font-bold text-brand-navy">${totalUsers}</div></div>
      <div class="bg-brand-lightgold/60 rounded-xl p-3"><div class="text-[10px] uppercase text-gray-500 font-semibold">Admins</div><div class="text-xs font-bold text-brand-navy break-all">${d.admins.map(esc).join('<br>')}</div></div>
    </div>`;

  for (const g of d.groups) {
    html += `
    <div class="border border-gray-200 rounded-2xl overflow-hidden">
      <div class="bg-brand-navy text-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="font-serif text-xl text-brand-gold">${esc(g.name)}</div>
          <div class="text-xs text-gray-300">Invite <span class="font-mono tracking-wider">${esc(g.code)}</span> · owner ${esc(g.owner_email)} · ${g.members} member${g.members == 1 ? '' : 's'} · created ${when(g.created_at)}</div>
        </div>
        <div class="flex flex-wrap gap-1">
          <button class="adm-btn text-brand-navy" onclick="adminRename('group','${g.id}','${esc(g.name)}')"><i class="fas fa-pen mr-1"></i>Rename</button>
          ${d.groups.length > 1 ? `<select class="text-xs border border-gray-200 rounded px-1.5 py-1 text-brand-navy" onchange="if(this.value){adminMergeGroups('${g.id}','${esc(g.name)}',this.value,this.options[this.selectedIndex].text)}"><option value="">Merge this circle into…</option>${groupOptions(g.id)}</select>` : ''}
          ${g.members == 0 ? `<button class="adm-btn text-red-600" onclick="if(confirm('Delete empty circle ${esc(g.name)}?'))adminCall('trip_admin_delete_group',{p_group:'${g.id}'},'Circle deleted.')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
      <div class="p-4 space-y-4">`;
    if (!g.parties.length) html += `<p class="text-gray-400 text-xs">No households yet.</p>`;
    for (const p of g.parties) {
      html += `
        <div class="border border-gray-100 rounded-xl">
          <div class="bg-gray-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 rounded-t-xl">
            <div><span class="font-bold text-brand-navy">${esc(p.name)}</span> <span class="text-xs text-gray-500">· head ${esc(p.head_email)} · ${p.headcount} on roster${p.budget_total ? ` · budget ${money(Number(p.budget_total), 'USD')}` : ''}${p.votes_locked ? ' · <span class="text-red-600 font-semibold">votes locked</span>' : ''}</span></div>
            <div class="flex flex-wrap gap-1">
              <button class="adm-btn" onclick="adminRename('party','${p.id}','${esc(p.name)}')"><i class="fas fa-pen"></i></button>
              <button class="adm-btn" onclick="adminCall('trip_admin_lock_votes',{p_party:'${p.id}',p_locked:${!p.votes_locked}},'Votes ${p.votes_locked ? 'unlocked' : 'locked'}.')" title="${p.votes_locked ? 'Unlock votes' : 'Lock votes'}"><i class="fas fa-${p.votes_locked ? 'lock-open' : 'lock'}"></i></button>
              <select class="text-xs border border-gray-200 rounded px-1.5 py-1" onchange="if(this.value){adminMergeParties('${p.id}','${esc(p.name)}',this.value,this.options[this.selectedIndex].text)}"><option value="">Merge household into…</option>${partyOptions(null, p.id)}</select>
              ${!p.users.length ? `<button class="adm-btn text-red-600" onclick="if(confirm('Delete empty household ${esc(p.name)}?'))adminCall('trip_admin_delete_party',{p_party:'${p.id}'},'Household deleted.')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
          </div>
          <table class="w-full"><tbody>${p.users.map(u => userRow(u, { pid: p.id, role: u.role })).join('') || '<tr><td class="p-3 text-xs text-gray-400">No accounts in this household.</td></tr>'}</tbody></table>
        </div>`;
    }
    if (g.unassigned.length) {
      html += `<div class="border border-dashed border-yellow-300 bg-yellow-50/50 rounded-xl"><div class="px-3 py-2 text-xs font-semibold text-yellow-800">In this circle but not in a household yet</div><table class="w-full"><tbody>${g.unassigned.map(u => userRow(u, {})).join('')}</tbody></table></div>`;
    }
    html += `</div></div>`;
  }
  if (d.orphans.length) {
    html += `<div class="border border-dashed border-red-300 bg-red-50/50 rounded-2xl"><div class="px-4 py-3 text-sm font-semibold text-red-800"><i class="fas fa-exclamation-circle mr-1"></i>Accounts that never joined a circle (likely duplicates or people who got stuck)</div><table class="w-full px-2"><tbody>${d.orphans.map(u => userRow(u, {})).join('')}</tbody></table></div>`;
  }
  $('admin-body').innerHTML = html;
}

window.adminMove = async (userId, target) => {
  const [gid, pid] = target.split('|');
  await adminCall('trip_admin_move_user', { p_user: userId, p_group: gid, p_party: pid || null }, 'Moved.');
};
window.adminMergeGroups = async (from, fromName, into, intoLabel) => {
  if (!confirm(`Merge circle "${fromName}" INTO ${intoLabel}?\n\nAll its households, members and votes move over and "${fromName}" disappears. Its invite code stops working.`)) return loadAdmin();
  await adminCall('trip_admin_merge_groups', { p_from: from, p_into: into }, 'Circles merged.');
};
window.adminMergeParties = async (from, fromName, into, intoLabel) => {
  if (!confirm(`Merge household "${fromName}" INTO ${intoLabel}?\n\nMembers, roster and votes move over; "${fromName}" disappears. The target keeps its head of household.`)) return loadAdmin();
  await adminCall('trip_admin_merge_parties', { p_from: from, p_into: into }, 'Households merged.');
};
window.adminRename = async (kind, id, current) => {
  const name = prompt(`New name for this ${kind === 'group' ? 'circle' : 'household'}:`, current); if (!name || name === current) return;
  await adminCall('trip_admin_rename', { p_kind: kind, p_id: id, p_name: name.trim() }, 'Renamed.');
};
window.adminRenameUser = async (userId, current) => {
  const name = prompt('Display name for this person:', current); if (!name || name === current) return;
  await adminCall('trip_admin_set_name', { p_user: userId, p_name: name.trim() }, 'Name updated.');
};
window.adminPassword = async (userId, email) => {
  const pw = prompt(`Temporary password for ${email} (8+ characters). Tell them to sign in with it and then keep using it or ask you to change it again:`);
  if (!pw) return; if (pw.length < 8) return showToast('8+ characters.', 'error');
  await adminCall('trip_admin_set_password', { p_user: userId, p_password: pw }, `Password set for ${email}.`);
};
window.adminDeleteUser = async (userId, email) => {
  if (!confirm(`Delete the account ${email}?\n\nTheir votes are removed. If they were the only person in a household, that household is deleted too. This cannot be undone.`)) return;
  await adminCall('trip_admin_delete_user', { p_user: userId }, 'Account deleted.');
};

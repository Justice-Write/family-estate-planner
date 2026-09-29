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
  party: null, isLeader: false,
  members: [], properties: [], votes: [], suggestion: '',
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
    $('party-modal').classList.add('hidden');
    hideLoading(); $('auth-modal').classList.remove('hidden');
    return;
  }
  $('auth-modal').classList.add('hidden');
  state.name = state.user.user_metadata?.name || state.user.email;
  showLoading('Checking family roster...');
  await loadParty();
});

// ── Party ───────────────────────────────────────────────────────────────────
async function loadParty() {
  const { data: party, error } = await sb.from('trip_parties').select('*').maybeSingle();
  if (error) { hideLoading(); return showToast(error.message, 'error'); }
  if (!party) { hideLoading(); await loadExistingParties(); $('party-modal').classList.remove('hidden'); return; }
  state.party = party; state.isLeader = party.head_user_id === state.user.id;
  setLoadingText('Loading estates...');
  await Promise.all([loadMembers(), loadProperties(), loadVotes(), loadSuggestion()]);
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

// ── Estates & votes ─────────────────────────────────────────────────────────
const isBuyTarget = (p) => p.status === 'sale';
const myVote = (id) => state.votes.some(v => v.property_id === id && v.user_id === state.user.id);
const tally = (id) => state.votes.filter(v => v.property_id === id).length;

function renderPropertiesGrid() {
  const grid = $('estates-grid');
  grid.innerHTML = state.properties.map(prop => {
    const voted = myVote(prop.id), n = tally(prop.id);
    return `
      <div class="property-card glass-card rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full ${voted ? 'property-voted' : ''}" onclick="openPropertyModal('${prop.id}')" id="card-${prop.id}">
        <div class="h-44 relative overflow-hidden bg-gray-200">
          <img src="${esc(prop.image || '')}" alt="${esc(prop.name)}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110">
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
          <div class="mt-3 text-[11px] text-gray-500"><i class="fas fa-poll text-brand-gold mr-1"></i>${n} party vote${n === 1 ? '' : 's'}</div>
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
  $('modal-image').src = prop.image || '';
  $('modal-description').textContent = prop.full_desc || '';
  $('modal-extras')?.remove();
  $('modal-tags').innerHTML = `
    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-users text-brand-gold mr-1"></i> ${esc(prop.capacity)}</span>
    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-tree text-brand-gold mr-1"></i> ${esc(prop.acreage)}</span>
    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-home text-brand-gold mr-1"></i> ${isBuyTarget(prop) ? 'Acquisition Target' : 'Vacation Rental'}</span>`;
  $('modal-amenities').innerHTML = (prop.amenities || []).map(a => `<li class="flex items-center gap-2"><i class="fas fa-check text-brand-gold text-xs"></i> ${esc(a)}</li>`).join('');
  $('modal-financials').innerHTML = `
    <div class="flex justify-between items-center pb-3 border-b border-gray-100/50"><span class="text-sm text-gray-600">Rental / Trial Stay</span><span class="font-bold text-brand-navy">${esc(prop.rental_cost)}</span></div>
    <div class="flex justify-between items-center pb-3 border-b border-gray-100/50"><span class="text-sm text-gray-600">Acquisition Price</span><span class="font-bold ${isBuyTarget(prop) ? 'text-green-700' : 'text-gray-500'}">${esc(prop.buy_cost)}</span></div>
    <div class="flex justify-between items-center pb-3 border-b border-gray-100/50"><span class="text-sm text-gray-600">Party votes</span><span class="font-bold text-brand-navy">${tally(prop.id)}</span></div>`;
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
  await loadVotes(); updateModalVoteButtonState(); renderPropertiesGrid();
  const prop = state.properties.find(p => p.id === id);
  if (prop) $('modal-financials').lastElementChild.lastElementChild.textContent = tally(id);
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
async function loadSuggestion() {
  const { data } = await sb.from('trip_party_users').select('suggestion').eq('user_id', state.user.id).maybeSingle();
  state.suggestion = data?.suggestion ?? '';
}

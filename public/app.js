// supabase-js v2.117.2, bundled locally (public/vendor/supabase.js) — no CDN dependency
import { createClient } from './vendor/supabase.js';

const SUPABASE_URL = 'https://fdlzvjdseljajjkdmdbv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cxiQDJcEuavGrefWGKVFMg_8gV0CNth';
const MAX_PARTY = 12;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

const state = { user: null, party: null, isHead: false, members: [], properties: [], votes: [], roster: [] };

// ── UI helpers ──────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}
function show(section) {
  ['authSection', 'chooseSection', 'dashboardSection'].forEach(id => $(id).classList.toggle('hidden', id !== section));
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── Auth ────────────────────────────────────────────────────────────────────
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('emailInput').value.trim(), password = $('passwordInput').value;
  const btn = $('authBtn'); btn.disabled = true; $('authMsg').textContent = '';
  try {
    let { error } = await sb.auth.signInWithPassword({ email, password });
    if (error && /invalid login credentials/i.test(error.message)) {
      const { data, error: e2 } = await sb.auth.signUp({ email, password });
      if (e2) throw e2;
      if (!data.session) { $('authMsg').textContent = 'Account created. Check your email to confirm, then log in.'; return; }
    } else if (error) throw error;
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; }
});
$('logoutBtn').addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((_evt, session) => {
  state.user = session?.user ?? null;
  $('logoutBtn').classList.toggle('hidden', !state.user);
  $('navUser').textContent = state.user?.email ?? '';
  if (state.user) loadParty(); else show('authSection');
});

// ── Party create / join ─────────────────────────────────────────────────────
document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => {
  $('createForm').classList.toggle('hidden', b.dataset.show !== 'createForm');
  $('joinForm').classList.toggle('hidden', b.dataset.show !== 'joinForm');
}));
$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.rpc('trip_create_party', { p_name: $('partyNameInput').value });
  if (error) return toast(error.message, true);
  toast('Party created.'); loadParty();
});
$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.rpc('trip_join_party', { p_code: $('partyCodeInput').value });
  if (error) return toast(error.message.replace(/^.*party not found.*$/i, 'No party with that ID.'), true);
  toast('Linked to party.'); loadParty();
});

async function loadParty() {
  const { data: party, error } = await sb.from('trip_parties').select('*').maybeSingle();
  if (error) return toast(error.message, true);
  if (!party) return show('chooseSection');
  state.party = party;
  state.isHead = party.head_user_id === state.user.id;
  await Promise.all([loadMembers(), loadRoster(), loadProperties(), loadVotes()]);
  renderDashboard();
  show('dashboardSection');
}

// ── Dashboard ───────────────────────────────────────────────────────────────
$('copyCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.party.code); toast('Party ID copied.'); } catch { toast(state.party.code); }
});

function renderDashboard() {
  const p = state.party;
  $('partyName').textContent = p.name + ' Family';
  $('copyCode').textContent = p.code;
  $('rosterWrap').textContent = `${state.roster.length} account${state.roster.length === 1 ? '' : 's'} linked`;

  // logistics
  const sel = $('partySize');
  if (!sel.options.length) for (let i = 1; i <= MAX_PARTY; i++) sel.add(new Option(i, i));
  const size = Math.max(1, state.members.length || 1);
  sel.value = size;
  renderMembers(size);
  $('budgetTotal').value = p.budget_total ?? '';
  $('budgetPerDay').value = p.budget_per_person_day ?? '';
  $('dates').value = p.preferred_dates ?? '';
  $('cobuyInterest').checked = p.cobuy_interest;
  $('cobuyQuestions').classList.toggle('hidden', !p.cobuy_interest);
  $('cobuyCapital').value = p.cobuy_capital_range ?? '';
  $('cobuyBorrow').value = p.cobuy_coborrow ?? '';

  $('logisticsFields').disabled = !state.isHead;
  $('cobuyFields').disabled = !state.isHead;
  $('logisticsNote').classList.toggle('hidden', state.isHead);
  $('saveRow').classList.toggle('hidden', !state.isHead);
  $('lockRow').classList.toggle('hidden', !state.isHead || p.votes_locked);
  $('lockedBanner').classList.toggle('hidden', !p.votes_locked);
  renderProperties();
}

$('partySize').addEventListener('change', (e) => renderMembers(+e.target.value));
$('cobuyInterest').addEventListener('change', (e) => $('cobuyQuestions').classList.toggle('hidden', !e.target.checked));

function renderMembers(count) {
  const c = $('membersContainer'); c.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const m = state.members.find(x => x.position === i) || {};
    c.insertAdjacentHTML('beforeend', `
      <div class="member" data-pos="${i}">
        <h4>Member ${i}${i === 1 ? ' (you)' : ''}</h4>
        <div class="row">
          <input type="text" placeholder="Name" data-f="name" value="${esc(m.name)}">
          <input type="number" placeholder="Age" min="0" max="120" data-f="age" value="${esc(m.age)}">
          <input type="text" placeholder="Allergies / accessibility needs" data-f="needs" value="${esc(m.needs)}">
        </div>
      </div>`);
  }
}

$('saveLogistics').addEventListener('click', async () => {
  const btn = $('saveLogistics'); btn.disabled = true; $('saveMsg').textContent = 'Saving…';
  try {
    const num = (v) => v === '' ? null : Number(v);
    const upd = {
      budget_total: num($('budgetTotal').value),
      budget_per_person_day: num($('budgetPerDay').value),
      preferred_dates: $('dates').value.trim() || null,
      cobuy_interest: $('cobuyInterest').checked,
      cobuy_capital_range: $('cobuyInterest').checked ? $('cobuyCapital').value.trim() || null : null,
      cobuy_coborrow: $('cobuyInterest').checked ? $('cobuyBorrow').value || null : null,
    };
    const { error: e1 } = await sb.from('trip_parties').update(upd).eq('id', state.party.id);
    if (e1) throw e1;

    const rows = [...document.querySelectorAll('#membersContainer .member')].map(el => ({
      party_id: state.party.id,
      position: +el.dataset.pos,
      name: el.querySelector('[data-f=name]').value.trim() || null,
      age: el.querySelector('[data-f=age]').value === '' ? null : +el.querySelector('[data-f=age]').value,
      needs: el.querySelector('[data-f=needs]').value.trim() || null,
    }));
    const { error: e2 } = await sb.from('trip_party_members').delete().eq('party_id', state.party.id).gt('position', rows.length);
    if (e2) throw e2;
    const { error: e3 } = await sb.from('trip_party_members').upsert(rows, { onConflict: 'party_id,position' });
    if (e3) throw e3;

    Object.assign(state.party, upd);
    await loadMembers();
    $('saveMsg').textContent = 'Saved.'; toast('Logistics saved.');
  } catch (err) { $('saveMsg').textContent = ''; toast(err.message, true); }
  finally { btn.disabled = false; }
});

// ── Properties & votes ──────────────────────────────────────────────────────
function renderProperties() {
  const g = $('propertyGrid'); g.innerHTML = '';
  const locked = state.party.votes_locked;
  for (const p of state.properties) {
    const mine = state.votes.some(v => v.property_id === p.id && v.user_id === state.user.id);
    const tally = state.votes.filter(v => v.property_id === p.id).length;
    g.insertAdjacentHTML('beforeend', `
      <div class="card ${p.status}">
        <div class="hero"><span class="badge ${p.status}">${p.status === 'sale' ? 'FOR SALE' : 'RENTAL ONLY'}</span></div>
        <div class="body">
          <h4>${esc(p.name)}</h4>
          <div class="small muted">${esc(p.location)}</div>
          <ul>${p.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
          ${p.risk ? `<div class="risk ${p.risk_level}"><strong>Risk:</strong> ${esc(p.risk)}</div>` : ''}
          <div class="tally">${tally} vote${tally === 1 ? '' : 's'} from your party</div>
          <button class="vote ${mine ? 'on' : ''}" data-id="${p.id}" ${locked ? 'disabled' : ''}>
            ${locked ? (mine ? 'Voted (locked)' : 'Locked') : (mine ? '✓ Voted — click to remove' : 'Vote for this Trip')}
          </button>
        </div>
      </div>`);
  }
  if (!state.properties.length) g.innerHTML = '<p class="muted">No properties listed yet.</p>';
}

$('propertyGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('.vote'); if (!btn || btn.disabled) return;
  const id = btn.dataset.id; btn.disabled = true;
  const mine = state.votes.some(v => v.property_id === id && v.user_id === state.user.id);
  const { error } = mine
    ? await sb.from('trip_votes').delete().eq('user_id', state.user.id).eq('property_id', id)
    : await sb.from('trip_votes').insert({ party_id: state.party.id, user_id: state.user.id, property_id: id });
  if (error) toast(error.message, true);
  await loadVotes(); renderProperties();
});

$('lockVotes').addEventListener('click', async () => {
  if (!confirm('Lock votes for the whole party? Nobody will be able to change their votes afterwards.')) return;
  const { error } = await sb.from('trip_parties').update({ votes_locked: true }).eq('id', state.party.id);
  if (error) return toast(error.message, true);
  state.party.votes_locked = true; toast('Votes locked.'); renderDashboard();
});

// ── Loaders ─────────────────────────────────────────────────────────────────
async function loadMembers() {
  const { data } = await sb.from('trip_party_members').select('*').eq('party_id', state.party.id).order('position');
  state.members = data ?? [];
}
async function loadRoster() {
  const { data } = await sb.from('trip_party_users').select('user_id, role');
  state.roster = data ?? [];
}
async function loadProperties() {
  const { data } = await sb.from('trip_properties').select('*').order('sort');
  state.properties = data ?? [];
}
async function loadVotes() {
  const { data } = await sb.from('trip_votes').select('user_id, property_id').eq('party_id', state.party.id);
  state.votes = data ?? [];
}

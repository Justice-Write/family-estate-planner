// Monthly discovery run: asks Perplexity's Agent API to redo the research brief and return the SQL upsert.
// Output lands in supabase/data/candidates-<date>.sql for HUMAN REVIEW via pull request — never auto-applied.
// Needs PERPLEXITY_API_KEY. Optional PPLX_PRESET (default "high" = the old Sonar Deep Research tier).
// Sonar Chat Completions support ended 2026-09-27; this uses /v1/agent in background mode and polls.
import fs from 'node:fs';
const key = process.env.PERPLEXITY_API_KEY;
const preset = process.env.PPLX_PRESET || 'high';
const base = (process.env.PPLX_BASE_URL || 'https://api.perplexity.ai').replace(/\/$/, '');
const pollMs = Number(process.env.PPLX_POLL_MS || 15000);
const maxWaitMs = Number(process.env.PPLX_MAX_WAIT_MS || 60 * 60 * 1000);
if (!key) { console.error('Set PERPLEXITY_API_KEY (repo secret).'); process.exit(2); }

const brief = fs.readFileSync('docs/HANDOFF-listings-research.md', 'utf8');
const existing = fs.readdirSync('supabase/data').filter(f => /^listings-.*\.sql$/.test(f)).sort().at(-1);
const prior = existing ? fs.readFileSync(`supabase/data/${existing}`, 'utf8') : '';
const input = [
  'You are a meticulous property researcher. Cite only what you verified on the live web today.',
  'Your entire answer must be a single valid PostgreSQL INSERT ... ON CONFLICT (id) DO UPDATE statement and nothing else.',
  '', brief, '', '---',
  `CURRENT LISTINGS (${existing ?? 'none'}) — update these ids in place; add new ids; never delete:`, prior,
  '', '---', 'Return ONLY the SQL file contents, nothing else.',
].join('\n');

const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const api = async (path, init = {}) => {
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> HTTP ${res.status}: ${text.slice(0, 2000)}`);
  return JSON.parse(text);
};

let r = await api('/v1/agent', { method: 'POST', body: JSON.stringify({ preset, input, background: true }) });
console.log(`Submitted ${r.id} (preset ${preset}), status ${r.status}`);
const started = Date.now();
while (['queued', 'in_progress'].includes(r.status)) {
  if (Date.now() - started > maxWaitMs) { console.error(`Timed out after ${maxWaitMs / 60000} min; run ${r.id} still ${r.status}.`); process.exit(1); }
  await new Promise(s => setTimeout(s, pollMs));
  r = await api(`/v1/agent/${r.id}`);
}
if (r.status !== 'completed') { console.error(`Run ${r.id} ended ${r.status}: ${JSON.stringify(r.error ?? r.incomplete_details ?? null)}`); process.exit(1); }

const items = Array.isArray(r.output) ? r.output : [];
let sql = r.output_text ?? items.filter(i => i.type === 'message')
  .flatMap(i => i.content ?? []).filter(c => c.type === 'output_text').map(c => c.text).join('\n');
sql = (sql || '').trim().replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/, '').trim();
if (!/^insert\s+into\s+public\.trip_properties/i.test(sql) || !/on\s+conflict\s*\(id\)\s*do\s+update/i.test(sql)) {
  console.error('Response is not a trip_properties upsert; refusing to write it. First 500 chars:\n' + sql.slice(0, 500));
  process.exit(1);
}
const sources = items.filter(i => i.type === 'search_results').flatMap(i => i.results ?? [])
  .map(({ title, url, date, last_updated }) => ({ title, url, date, last_updated }));

const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(`supabase/data/candidates-${date}.sql`, sql + '\n');
fs.writeFileSync(`supabase/data/candidates-${date}.citations.json`, JSON.stringify({ run: r.id, preset, sources }, null, 2) + '\n');
console.log(`Wrote supabase/data/candidates-${date}.sql (${sql.length} chars, ${sources.length} sources)`);

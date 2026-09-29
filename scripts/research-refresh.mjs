// Monthly discovery run: asks Perplexity's Sonar API to redo the research brief and return the SQL upsert.
// Output lands in supabase/data/candidates-<date>.sql for HUMAN REVIEW via pull request — never auto-applied.
// Needs PERPLEXITY_API_KEY. Set PPLX_MODEL to the current deep-research model name from Perplexity's docs.
import fs from 'node:fs';
const key = process.env.PERPLEXITY_API_KEY, model = process.env.PPLX_MODEL;
if (!key || !model) { console.error('Set PERPLEXITY_API_KEY and PPLX_MODEL'); process.exit(2); }
const brief = fs.readFileSync('docs/HANDOFF-listings-research.md', 'utf8');
const existing = fs.readdirSync('supabase/data').filter(f => f.endsWith('.sql')).sort().at(-1);
const prior = existing ? fs.readFileSync(`supabase/data/${existing}`, 'utf8') : '';
const prompt = `${brief}\n\n---\nCURRENT LISTINGS (update these ids in place; add new ids; never delete):\n${prior}\n\n---\nReturn ONLY the SQL file contents, nothing else.`;
const res = await fetch('https://api.perplexity.ai/chat/completions', {
  method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, temperature: 0.1, messages: [
    { role: 'system', content: 'You are a meticulous property researcher. Cite only what you verified on the live web today. Output must be a single valid PostgreSQL INSERT ... ON CONFLICT (id) DO UPDATE statement.' },
    { role: 'user', content: prompt } ] }) });
if (!res.ok) { console.error(await res.text()); process.exit(1); }
const j = await res.json();
let sql = j.choices?.[0]?.message?.content ?? '';
sql = sql.replace(/^```sql\s*/i, '').replace(/```\s*$/, '');
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(`supabase/data/candidates-${date}.sql`, sql);
fs.writeFileSync(`supabase/data/candidates-${date}.citations.json`, JSON.stringify(j.citations ?? j.search_results ?? [], null, 2));
console.log(`Wrote supabase/data/candidates-${date}.sql (${sql.length} chars)`);

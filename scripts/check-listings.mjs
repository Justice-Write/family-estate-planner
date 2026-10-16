// Weekly freshness check: every hero, gallery, and listing URL on active cards must still resolve.
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads all rows, bypassing RLS). Prints a report; exit 1 on failures.
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Config/API problems must not pass silently: write a report + a non-zero `failures` output so the
// workflow's issue step fires, then exit 2. Exit 1 is reserved for broken listing URLs.
const configFail = async (msg) => {
  console.error(msg);
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('node:fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'failures=config\n');
    fs.writeFileSync('health-report.md', `# Listing health — ${new Date().toISOString().slice(0, 10)}\n\n**The check could not run.** ${msg}\n\nAdd or fix the repo secret \`SUPABASE_SERVICE_ROLE_KEY\` (Settings → Secrets and variables → Actions).\n`);
  }
  process.exit(2);
};
if (!url || !key) await configFail('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
const resp = await fetch(`${url}/rest/v1/trip_properties?select=id,name,active,image,gallery,listing_url&active=eq.true`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` } });
const rows = await resp.json().catch(() => null);
if (!resp.ok || !Array.isArray(rows)) await configFail(`Supabase read failed: HTTP ${resp.status} ${JSON.stringify(rows).slice(0, 300)}`);
if (rows.length === 0) await configFail('Zero active listings returned: wrong key (anon instead of service role?) or table empty.');
const checks = [];
for (const r of rows) {
  if (r.image) checks.push({ id: r.id, kind: 'hero', u: r.image });
  (r.gallery || []).forEach((u, i) => checks.push({ id: r.id, kind: `gallery[${i}]`, u }));
  if (r.listing_url) checks.push({ id: r.id, kind: 'listing', u: r.listing_url });
}
const probe = async (c) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    let res = await fetch(c.u, { method: 'HEAD', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (listing-health-check)' } });
    if (res.status === 405 || res.status === 403) res = await fetch(c.u, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (listing-health-check)', Range: 'bytes=0-0' } });
    return { ...c, ok: res.ok, status: res.status };
  } catch (e) { return { ...c, ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(t); }
};
const results = [];
for (let i = 0; i < checks.length; i += 8) results.push(...await Promise.all(checks.slice(i, i + 8).map(probe)));
const bad = results.filter(r => !r.ok);
const lines = [`# Listing health — ${new Date().toISOString().slice(0, 10)}`, '', `${results.length} URLs checked across ${rows.length} active cards. **${bad.length} failing.**`, ''];
if (bad.length) { lines.push('| card | what | status | url |', '|---|---|---|---|'); bad.forEach(b => lines.push(`| ${b.id} | ${b.kind} | ${b.status} | ${b.u} |`)); }
const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_OUTPUT) { const fs = await import('node:fs'); fs.appendFileSync(process.env.GITHUB_OUTPUT, `failures=${bad.length}\n`); fs.writeFileSync('health-report.md', report); }
process.exit(bad.length ? 1 : 0);

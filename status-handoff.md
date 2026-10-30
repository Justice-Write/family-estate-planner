# status-handoff — Family Estate & Trip Planner

**Last updated:** 2026-10-29 06:45 UTC by Claude (Cowork, claude-opus-5-5), family-estate-planner project session (recovery pass)
**Canonical:** this file is the single source of truth for project status. `README.md` holds the deeper technical reference. **`RECOVERY-HANDOFF-2026-10-28.md`** holds the full background: inception and intention, every feature you asked for, and the roadmap with progress.

---

## 0. Operating protocol — mandatory for every agent and model

Any LLM or person working in this repo follows these rules. No exceptions for "small" changes.

1. **Read first.** Read this whole file before doing anything. Then read whatever `README.md` sections your task touches.
2. **Before you start work:** add an entry under **§1 In progress**. Give the date, who you are (tool + model), what you are about to do, and which files or systems you will touch. Save the file (and commit it if you can) **before** you start the work itself. If you are interrupted, the next agent will know what was underway.
3. **After you finish, or when you stop for any reason:**
   - Remove your entry from §1.
   - Add a dated entry at the top of **§8 Work log**. Say what changed, the commit SHA, and what you verified versus what is still untested.
   - Update **§5 Current state**, **§6 Open items** and **§7 Gotchas** so they describe the project as it is *now*.
   - Update "Last updated" at the top.
4. **Stale "In progress" entries:** an entry left by someone else means that work was interrupted. Check what actually landed (git log, database, live site), then finish it or roll it back, and record what you found in the Work log.
5. **Current state means current.** History goes only in the Work log, newest first. Never delete Work log entries.
6. **Never put secrets in this file**, including API keys, the Supabase service-role key, passwords, or personal data about family members beyond first names.
7. **If you can't write to the repo**, put the exact text you would have added in your reply to the owner so they can paste it in.

---

## 1. In progress



_Nothing in progress._

---

## 2. What this project is

A private website where Christian's extended family plans one annual group trip. People join a **circle** (one per family or friend group) and form **households** (called "parties" in the code). Each person votes on candidate rental properties (castles, manors, villas), and each household records its budget and dates. A second track, buying a jointly owned estate through a family LLC, exists but is **hidden by default**. The family is wary of buying property with anyone else, so the site must read as a friendly vacation planner unless a circle turns that track on.

- **Owner / sole admin:** Christian (GitHub `Justice-Write`).
- **Trip window being planned:** Dec 15, 2026 – Jan 5, 2027.

## 3. Where everything is

| Thing | Location |
|---|---|
| Live site | https://family-estate-planner.pages.dev |
| Repo (public) | https://github.com/Justice-Write/family-estate-planner, branch `main` |
| Hosting | Cloudflare Pages, Git-connected; build output dir `public/`, no build step. Every push to `main` deploys. |
| Database | Supabase project `fdlzvjdseljajjkdmdbv` ("Family Estate Planner - Free", us-east-2, **org "Castleborn - Free"**) |
| Owner's local clone | `C:\Users\Justice Right\Documents\GitHub\family-estate-planner` on the desktop "Sophia" (Windows) |
| Claude.ai project doc | `claude/family-estate-planner.md` in the "family estate planner" Claude project. This is a summary that points here. |

## 4. Architecture (short; details in README)

- **Front end:** `public/index.html` + `public/app.js` (plain ES modules, Tailwind CDN). supabase-js is bundled locally in `public/vendor/supabase.js`. The publishable key is in `app.js` on purpose, because **RLS is the security boundary**.
- **Database:** all tables are prefixed `trip_`:
  - `trip_groups` (circles), `trip_group_users`
  - `trip_parties` (households), `trip_party_users`, `trip_party_members`
  - `trip_properties` (listings), `trip_votes`, `trip_admins`

  Writes go through `SECURITY DEFINER` RPCs (`trip_create_*`, `trip_join_*`, `trip_admin_*`, `trip_set_group_acquisition`, …). Migrations live in `supabase/migrations/` (base → v2 → v3 → v4 → v5 → v6) and are applied via the Supabase SQL editor or MCP `apply_migration`.
- **Listings data:** listings are rows in `trip_properties`. The current baseline file is `supabase/data/listings-2026-09-29.sql`. New research arrives as a single `insert … on conflict (id) do update` SQL file. **Never delete listing rows** because votes reference them; set `active = false` instead. Rentals use `sort` 10–199 and sale rows use 200–399.
- **Vacation-first switch:** `trip_groups.show_acquisition` (default false). When it is off, `status='sale'` rows are hidden by RLS and no LLC or investment wording shows. Christian's circle has it **off**. Do not add estate, LLC or "syndicate" language to default UI copy.
- **Research loop:**
  - Manual: paste a brief from `docs/` into Perplexity Computer. It returns SQL, which you paste into the Supabase SQL editor and then commit as `supabase/data/listings-YYYY-MM-DD.sql`.
  - Automated: `.github/workflows/listing-research.yml` runs on the 1st of each month. `scripts/research-refresh.mjs` calls the Perplexity Agent API `/v1/agent` with preset `high` in background mode and opens a PR with `supabase/data/candidates-DATE.sql`. It never applies anything on its own.
- **Health check:** `.github/workflows/listing-health.yml` runs Mondays at 06:17 UTC. `scripts/check-listings.mjs` checks every image and listing URL on active cards and opens or updates a GitHub issue labelled `listing-health` when something fails, including when its secret is missing.

### How to do common things
- **Run an admin RPC from the Supabase MCP:** it checks `auth.uid()`, so wrap it like this:
  `do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from trip_admins limit 1), 'role','authenticated')::text, true); perform public.trip_admin_merge_groups('<from>'::uuid, '<into>'::uuid); end $$;`
- **Apply new listings:** paste the SQL file into the Supabase SQL editor, then commit it to `supabase/data/` so the monthly job uses it as the new baseline.
- **Add an admin:** `insert into trip_admins(user_id) select id from auth.users where email='…';`
- **Unlock a household's votes:** `update trip_parties set votes_locked = false where code = '…';`

## 5. Current state (as of 2026-10-29)

- **Site:** live at https://family-estate-planner.pages.dev. `main` = `origin/main` (pushed 2026-10-29: `f1a0e02` + `f6f9a9c` recovery docs, plus this log update). Working tree clean; nothing unpushed except the superseded branch below.
- **ChatGPT history loss (10-28):** no effect on this project. It was never a ChatGPT or Codex project; its history lives in this repo and the Claude project.
- **Local-only branch:** `codex/listing-workflows-review-20261001` (`cc44bb7`) is superseded by `3343c23` (same workflow files). Kept.
- **Circles:** one circle, FAMILY-1204 "Christian's Family", with 4 members (ALISAMED-6015 merged in on 2026-10-14).
- **Votes:** **0** as of 2026-10-14, the last database read. The Oct 25 vote deadline in the drafted nudge has passed; result unknown.
- **Listings:** 19 rows, 14 active (11 rentals, 3 sale), per the 2026-09-29 baseline. The 10-16 availability pass has not been committed (probably not run).
- **GitHub Actions:** the repo still has **no secrets** (checked 2026-10-29). The health check ran 10-19 and 10-26 and correctly opened, then commented on, **issue #1** (`SUPABASE_SERVICE_ROLE_KEY` not set). The research job will fail on **Nov 1** without `PERPLEXITY_API_KEY`.
- **Supabase access for agents:** the connector is authorized only for org `eizfsooqavulpjngwsbd`. This project is in "Castleborn - Free", so queries return "You do not have permission".
- **Claude shell:** Cowork's Linux shell lost its mount to the PC at about 22:20 AKDT on 10-28, so git can't run from Cowork until the desktop app or PC restarts. File tools work, and commits and pushes go through GitHub Desktop.

## 6. Open items

**Needs Christian (agents cannot do these):**
1. **Check votes** in the Admin console. If still none, re-send the nudge (text in `RECOVERY-HANDOFF-2026-10-28.md` §4) with a new deadline. The trip window opens **Dec 15**.
2. **Run `docs/BRIEF-2026-10-16-availability-pass.md`** in Perplexity Computer. Apply the SQL it returns, then commit it as `supabase/data/listings-2026-1X-XX.sql`.
3. **Add repo secrets** `SUPABASE_SERVICE_ROLE_KEY` and `PERPLEXITY_API_KEY` (Settings → Secrets and variables → Actions). Then Actions → "Listing health check" → Run workflow, and close issue #1 when it is green.
4. **Reconnect the Claude Supabase connector** and grant org "Castleborn - Free".

**Agent-doable once unblocked:**
5. After the secrets exist: dispatch both workflows, confirm they work against the real APIs (only mock-tested so far), and review the research PR.
6. After database access returns: re-check votes, members and listings, then update §5.
7. Workflow housekeeping completed in the October release continuation: removed the unused model variable and bounded the job at 70 minutes.
8. Optionally delete the superseded local branch `codex/listing-workflows-review-20261001` once the OneDrive bundle exists.

## 7. Gotchas for agents

- **Cowork/remote tools cannot write `.github/workflows/*`** (protected path). Edit those files locally (Claude Code, Cursor, an editor) and commit.
- **The device VM (Cowork `device_bash`) has no git credentials,** and git there needs delete permission to clear its own `.lock` files. Commit there or through GitHub Desktop, then push with **GitHub Desktop** on Sophia (the repo is added; press Ctrl+P).
- **The cloud sandboxes cannot reach** listing sites, `*.pages.dev` or `*.supabase.co` directly. GitHub (API and raw) works. The built-in browser pane is signed into GitHub.
- **Health check exit codes:** `check-listings.mjs` exits 1 for broken URLs and 2 for config or API errors. In both cases it writes `health-report.md` (gitignored) and a `failures` output, and the workflow turns that into issue #N.
- **Files use LF line endings.** Git on Windows may convert them to CRLF on checkout. Harmless.
- **The owner wants** decisive, concise output. Don't recap. When another tool fits a sub-task better (for example Perplexity Computer for live listing research), say so and hand over a ready-to-paste brief.

## 8. Work log (newest first)

- **2026-10-29 Codex release-round:** completed listed workflow housekeeping, validated YAML and both Node script syntaxes, pushed 7371d5c to main/review branch. No provider calls, database writes or public application code changes.


- **2026-10-29 — Claude (Cowork, claude-opus-5-5), recovery pass:** after the ChatGPT history loss, checked this repo. Found no uncommitted code. Found 1 unpushed docs commit (`f1a0e02`) and 1 superseded local branch (`cc44bb7`). Re-checked GitHub: no secrets, issue #1 re-flagged 10-26. Database still unreachable from Claude. Wrote `RECOVERY-HANDOFF-2026-10-28.md` (recovery report, inception and intention, roadmap of prompted features, planned roadmap with status). Updated this file and the README changelog. Committed and pushed through GitHub Desktop as `f6f9a9c` (verified on GitHub at 06:38 UTC); this log update was pushed the same way. Verified: GitHub commit list. Not verified: database state.

- **2026-10-20 — Claude (Cowork, claude-opus-5-5):** created `status-handoff.md` (this file) with its operating protocol, plus `AGENTS.md` and `CLAUDE.md` pointers. Confirmed the Oct 19 health run opened issue #1 (secret missing), so the Oct 16 fix works. Supabase is still unreachable from the connector. Committed locally; **push pending** (computer in use by another session).
- **2026-10-16 — Claude (Cowork):**
  - `2f8d9b3`: moved the research script from Sonar `/chat/completions` (support ended 2026-09-27) to the Perplexity Agent API; it now validates its output. Fixed the health check, which had been passing green while checking nothing; it now reports missing or wrong secrets. Created the `listing-health` label. Tested both scripts against a local mock only.
  - `576c3eb`: added the availability-first brief, removed a stale table from the handoff brief, updated the README changelog. Added the repo to GitHub Desktop.
- **2026-10-14 — Claude (Cowork):** merged the stray circle ALISAMED-6015 into FAMILY-1204 via `trip_admin_merge_groups`.
- **2026-10-05 — Cursor:** `3343c23` committed both GitHub Actions workflows.
- **2026-09-30 — v6:** vacation-first default; acquisition track behind the per-circle `show_acquisition` switch. **v5:** admin console (12 admin RPCs).
- **2026-09-29 — v2–v4:** full design port, listing URLs and galleries, circles with invite codes, live currency conversion, research brief round two. Moved to the dedicated Supabase project; deployed to Cloudflare Pages.
- **2026-09-28:** initial build (schema + RLS, Supabase auth, households, votes).

## Release continuation — 2026-10-29

Codex completed the previously listed agent-doable workflow cleanup in isolated branch codex/family-research-timeout-20261029: 70-minute job timeout around the existing 60-minute script polling budget; removed unused PPLX_MODEL environment input. Schedule, database operations and paid-provider calls unchanged. No workflow was dispatched and no provider API was called. Script syntax/YAML validation is the relevant check; credentials, votes, listing availability and Supabase access remain blocked as documented. Workflow and documentation commit 7371d5c is pushed to main and the release branch; GitHub reports the existing workflow active. Credentials and database/provider acceptance remain blocked, so no research or health-check workflow was dispatched.

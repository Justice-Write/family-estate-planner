# Family Estate & Trip Planner — Recovery Handoff (2026-10-28)

**Written:** 2026-10-29 by Claude (Cowork, claude-opus-5-5), family-estate-planner project session.
**Why:** on 2026-10-28 ChatGPT lost about a week of chats and project folders. This document rebuilds the whole picture from sources that survived: the repo, its git history, the docs, the live site's copy, the Claude project, and GitHub. Sources are listed in §6.
**Live status:** for up-to-the-minute status, `status-handoff.md` in this folder wins. This file is the deep background.

---

## 0. Recovery report: what was checked and saved

| Check | Result |
|---|---|
| Did the ChatGPT loss touch this project? | **No.** It was never a ChatGPT project: it is not among the 33 in the local ChatGPT Projects mirror, and Codex has no threads for it. All of its history lives in this repo, the Claude project "family estate planner", and Supabase. |
| Uncommitted work | **None.** Working tree clean on `main` (read-only scan, 2026-10-29 ~06:00 UTC). |
| Committed but not on GitHub | `f1a0e02` "docs: add status-handoff.md with agent update protocol" (2026-10-20), docs only. **Now pushed** (see below). |
| Local-only branch | `codex/listing-workflows-review-20261001` (`cc44bb7`, 2026-09-30, Codex). Its workflow files match `main`'s `3343c23` byte-for-byte apart from line endings, so it is **superseded**. Kept, not deleted. |
| Codex worktree | `Documents\Codex\2026-09-30\task-4\family-listing-workflows-review`: clean. Same content as above. |
| Saved this session | This file, an updated `status-handoff.md`, and a README changelog line. **Committed and pushed** through GitHub Desktop as `f6f9a9c`, together with the Oct 20 docs commit `f1a0e02` (verified on GitHub 2026-10-29 06:38 UTC). The Claude Linux shell has been down since about 22:20 AKDT on 10-28, so GitHub Desktop was used instead of git. |
| Off-machine backup | GitHub now holds all of `main`. `_ops/recovery-2026-10-28/recovery-backup-and-push.ps1` will also bundle this repo to OneDrive, including the superseded local branch. |
| GitHub Actions | Issue #1 is open. The health check runs every Monday; on 10-19 and again on 10-26 it reported that `SUPABASE_SERVICE_ROLE_KEY` is not set. The repo has **no** Actions secrets (checked 2026-10-29). |
| Database | Not checkable from Claude. The Supabase connector is authorized for a different org, while this project lives in org "Castleborn - Free". The last reading (2026-10-14) was 1 circle, 4 members, **0 votes**. |

---

## 1. Inception and intention

**Where it started.** The original design was a "Generational Wealth Scouting Portal": a Tailwind front end over a Firebase stub. Its premise was *the Master Plan*, still in the site's copy:

> "This trip is more than a vacation. It's a due-diligence mission to identify, test, and potentially acquire a global family estate."

The plan was for about five households to form one LLC, pool capital (the site shows every asking price split five ways), share guaranteed weeks, and rent out unused time for income.

**What it became (2026-09-28 → 09-30).** Christian had it rebuilt on Supabase with Postgres row-level security so the extended family could actually use it. Each household signs up, says who's coming, what they can spend and which dates work, and everyone hearts the places they'd go. The brief defined two tracks:

- **Track A — the trip (`rental`).** Exclusive use of one character property (castle, manor, estate, historic villa) for the whole family. Requirements:
  - Window: **Dec 15 – Jan 5**.
  - Sleeps 12 minimum, up to 50.
  - Self-catering.
  - Roughly $900–$6,000 per night.
  - Regions: Scotland, Ireland, England and Wales, France, Italy, Iberia, Japan and others.
- **Track B — the generational asset (`sale`).** A property the family LLC could buy, tested first with a paid stay. Requirements:
  - No price ceiling.
  - Must be stayable now.
  - At least 8 bedrooms, or a main house plus cottages.
  - Rental-income potential.
  - Jurisdiction risk called out first.

**The pivot (2026-09-30, v6).** Christian's family is wary of buying anything with anyone else. The site's main view therefore became a friendly **family-vacation planner**. All estate, LLC and "syndicate" wording, plus the sale listings themselves (enforced by RLS), are hidden unless a circle switches the estate track on. Christian's own circle has it **off**.

**Other standing intentions:**
- **Family suggestions feed research.** Family members suggest listings, and a research agent (Perplexity) verifies them and updates the catalog.
- **Christian is the sole admin.** He expects duplicate accounts and forgotten passwords, so admin tools can merge and fix them.
- **Other groups later.** The site will later be shared with friends and other families, each as a separate circle that shares nothing with the others.

---

## 2. Roadmap of prompted features (what Christian asked for, in order)

| # | When | Ask | Delivered as | Status |
|---|---|---|---|---|
| 1 | 09-28 | Make the stub real: accounts, households, voting, head-of-household logistics, vote lock, parties larger than 6 | Initial build: Supabase auth, RPC-only create/join, RLS, party size up to 12 | ✅ live |
| 2 | 09-28/29 | Its own database and free hosting | `d0ea382` dedicated Supabase project; Cloudflare Pages, Git-connected | ✅ live |
| 3 | 09-29 | Bring back the full original design | v2 `65c97e4`: 7 estates, Zillow-style modal, name-based identity, join-by-dropdown, party size ± (max 20), multiple date ranges, capital and income questions, suggestion box. `07b16ea` backfilled names for early accounts | ✅ live |
| 4 | 09-29 | Real listings: links, photo galleries, family suggestions, Perplexity research loop | v3 `333313a` (listing URL, gallery, suggestions feed, research handoff doc) + `a97a08a` (19 researched listings applied, 14 active) | ✅ round 1 done |
| 5 | 09-29 | Separate groups for friends and other families; prices in your own currency; lift the price cap for estate research | v4 `1443086` (circles with invite codes, per-circle scoping, live ECB currency conversion, round-two brief) + `13cd856` (header shows circle name) | ✅ live |
| 6 | 09-29 | Automate research and catch broken listing links | Workflows written in v4 but held back because the token lacked `workflow` scope. Committed `3343c23` (10-05, Cursor). Fixed `2f8d9b3` (10-16): Perplexity Agent API, and a health check that reports honestly | 🟡 built; **blocked on repo secrets** |
| 7 | 09-30 | Admin tools for duplicate accounts and forgotten passwords | v5 `231030d`: admin console with 12 RPCs (move, merge circles and households, rename, set head, lock votes, fix names, temporary passwords, delete duplicates) | ✅ used: "The Cohens" merged around 09-30; Alisa's circle merged 10-14 |
| 8 | 09-30 | Keep it a vacation planner; hide the estate/LLC material unless the family asks | v6 `7d683c9`: per-circle `show_acquisition` switch, enforced in RLS | ✅ live (off for your circle) |
| 9 | 10-13 | "Anything left to do?" plus merge Alisa's stray circle | `trip_admin_merge_groups`: FAMILY-1204 now has 4 members | ✅ 10-14 |
| 10 | 10-16 | Continue the roadmap: next listings round | Availability-first brief for the Dec 15 – Jan 5 window (`576c3eb`, `docs/BRIEF-2026-10-16-availability-pass.md`) | 🟡 written; **not run yet** |
| 11 | 10-16 | "Continue on roadmap until nothing left" | Research job moved off the retired Sonar API; health check stopped passing silently; `listing-health` label created; family vote nudge drafted (deadline **Oct 25**) | ✅ code. 🟡 nudge: unknown whether it was sent |
| 12 | 10-20 | An always-current `status-handoff.md` in every project, updated before and after work | `f1a0e02` (+ `AGENTS.md`, `CLAUDE.md`) | ✅ pushed 10-29 |
| 13 | 10-28 | Recovery after the ChatGPT loss, plus this handoff | This file + `status-handoff.md` update (`f6f9a9c`) | ✅ pushed 10-29 |

---

## 3. Planned roadmap and where we are

Legend: ✅ done · 🟡 in progress or blocked · ⏳ not started · 💤 deliberately parked

### Phase 1 — Platform ✅ complete (v1–v6, Sept 28–30)
Accounts, households, votes, logistics, circles, currency, admin console and the vacation-first switch are all live at https://family-estate-planner.pages.dev.

### Phase 2 — Automation and upkeep 🟡 blocked on two secrets
- ✅ Weekly link check (Mondays) and monthly research PR (1st of the month), both rewritten and tested against a mock.
- ⛔ The repo has no secrets. The link check opens or updates issue #1 each week, and the **Nov 1 research run will fail** unless `PERPLEXITY_API_KEY` is added.
- ⏳ Small cleanup in `listing-research.yml`: it passes an unused `PPLX_MODEL` and has no timeout. Needs a local edit, because remote tools can't write `.github/workflows/`.

### Phase 3 — The 2026 trip (Dec 15 – Jan 5) 🟡 **critical path; about 7 weeks out**
| Step | Status |
|---|---|
| 3a. Family joins the circle and votes | 🟡 1 circle, 4 members, **0 votes** as of 10-14. A nudge with an Oct 25 deadline was drafted on 10-16. That deadline has passed and the result is unknown (database not readable from Claude). |
| 3b. Confirm which rentals are actually open in the window | ⏳ The brief is ready (`docs/BRIEF-2026-10-16-availability-pass.md`), but no new listings file has been committed, so the pass has probably not run. |
| 3c. Pick and book the winner | ⏳ Christmas exclusive-use castles book early, so this is the most time-sensitive item. |
| 3d. Household logistics (who's coming, budgets, dates) | The site supports it; data not checked since 10-14. |

### Phase 4 — Listings round two 💤 after the trip is booked
The full brief (`docs/HANDOFF-listings-research.md`) adds 6–8 sale targets across price tiers, 3–4 more rentals, and checks every existing card. Once `PERPLEXITY_API_KEY` exists it also runs monthly on its own.

### Phase 5 — Estate co-ownership track 💤 parked by design
Built and hidden. It turns on per circle (circle bar checkbox or admin console) only if the family asks. The longer-term idea is to treat a trip stay as the due-diligence visit for a property worth buying.

### Phase 6 — Friends and other families ⏳ ready, not used yet
Circles with invite codes already keep groups fully separate. Nobody outside FAMILY-1204 has been invited.

### Ops backlog
- Reconnect the Claude Supabase connector to org "Castleborn - Free" so agents can check votes and apply listing SQL.
- Outside this project, noted once: a GitHub Enterprise "R3d Academy" plan at about $21/mo and an empty MyPersonas GitHub org.

---

## 4. Next actions, in order

1. **Check votes** in the site's Admin console. If they're still at zero, re-send the nudge below with a new deadline.
2. **Run the availability pass:** paste `docs/BRIEF-2026-10-16-availability-pass.md` into Perplexity Computer, apply the returned SQL in the Supabase SQL editor, and commit it as `supabase/data/listings-2026-1X-XX.sql`.
3. **Add the repo secrets** `SUPABASE_SERVICE_ROLE_KEY` and `PERPLEXITY_API_KEY` (Settings → Secrets and variables → Actions). Then use "Run workflow" on the link check and close issue #1.
4. **Reconnect the Supabase connector** to the "Castleborn - Free" org.

**Vote nudge (re-send with a new date):**
> Hey everyone! Christmas trip time. The castles and villas are up at https://family-estate-planner.pages.dev. Please look through them, heart your favorites and add the dates that work for you (anywhere Dec 15 – Jan 5) by **[new date]**. Holiday dates book fast, so we'll lock one in right after. New to the site? Sign up with code **FAMILY-1204**. Forgot your password? Text me and I'll reset it.

---

## 5. Codex/ChatGPT note (affects your other projects, not this one)

Codex's local history is **intact**. `C:\Users\Justice Right\.codex\sessions` holds 1,968 session logs (about 30 GB) through 10-28. What broke was the desktop app's chat-to-project mapping (`thread-project-assignments` in `.codex-global-state.json`), which shrank from about 16 KB on Oct 3 to almost nothing. This matches a known Windows Codex bug reported this week (openai/codex #57578). Don't reinstall, reset or sign out of Codex, and don't delete anything in `.codex`.

---

## 6. Sources used for this rebuild

- `.git/logs/HEAD`: full commit history 2026-09-29 → 10-20.
- `README.md` changelog, `docs/HANDOFF-listings-research.md`, `docs/BRIEF-2026-10-16-availability-pass.md`, and the visible copy of `public/index.html`.
- Claude project "family estate planner": project doc `claude/family-estate-planner.md`, project memory, and this project's Cowork conversation (10-13 → 10-28).
- GitHub API, read 2026-10-29: commits, Actions runs (10-12, 10-19, 10-26), issue #1 and its comments, and the repo secrets page.
- `Documents\GitHub\_backups\recovery-2026-10-28-chatgpt-projects\INDEX.md` (written by another recovery session), which confirms there is no ChatGPT project for this site.
- Read-only git inventory of `Documents\GitHub` and `Documents\Codex`, 2026-10-29 ~06:00 UTC.

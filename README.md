# Family Estate & Trip Planner

Static site (no build step) + Supabase. Everything in `public/` is the deployable.

## Stack
- `public/index.html` + `app.js` — the "Generational Wealth Scouting Portal" design (Tailwind CDN, FontAwesome, Playfair/Inter). Plain ES modules, no build.
- `public/vendor/supabase.js` — supabase-js v2.117.2 bundled locally (esbuild). No runtime CDN dependency.
- Supabase project **Family Estate Planner - Free** (`fdlzvjdseljajjkdmdbv`, us-east-2, org Castleborn - Free). Tables are `trip_*`.
- Publishable key is in `app.js` — that's by design; RLS is the security boundary.

## The rules (who can do what)
Enforced in Postgres by RLS — the front end only reflects them. Full SQL: `supabase/migrations/20260928_trip_planner.sql` → `20260929_v2_full_design.sql` → `20260929_v3_listing_url.sql` → `20260929_v4_groups_prices.sql` → `20260930_v5_admin.sql` → `20260930_v6_acquisition_toggle.sql`.

| Actor | Can | Cannot |
|---|---|---|
| Anyone signed in | Join ONE circle by invite code or create one (becomes circle owner) | Be in two circles |
| Circle member | Read the shared catalog + their circle's private listings; see circle-wide vote tallies; pick a party in their circle | See other circles' parties, votes, or suggestions |
| Any user | Create ONE party (becomes Head) **or** join ONE party by code — never both, never two | Create/join directly via table insert (only via `trip_create_party` / `trip_join_party` RPCs) |
| Head of Household | Edit budget, dates, headcount, member details, co-buy answers; lock votes | Edit another party; unlock votes (SQL editor only) |
| Secondary member | Cast/remove their own votes; see the party tally; save a suggestion link | See or edit logistics; vote as someone else; change votes after lock |
| Head, after lock | Still edit logistics | Change any votes (the lock applies to the head too) |
| Properties | — | Anyone. Add/edit rows only from the Supabase SQL editor or service role |

Joining is by picking the party from a dropdown (`trip_list_parties` exposes only party name + leader name). Legacy join-by-code RPC still exists.

Verified against the live database with a 16-check RLS test (head/member/outsider, pre- and post-lock): all pass.

## Deploy — Cloudflare Pages (free)
**Direct upload (fastest):** Cloudflare dashboard → Workers & Pages → Create → Pages → Upload assets → drag the `public/` folder. Done; you get `*.pages.dev`.

**CLI:** `npx wrangler pages deploy public --project-name family-estate-planner` (needs `CLOUDFLARE_API_TOKEN` with *Cloudflare Pages: Edit*).

## Supabase settings to check once (dashboard → Authentication)
1. **Email confirmations** — default ON. For a family app, turn it OFF (Providers → Email → "Confirm email") so people can log in immediately. The app handles both cases.
2. **Site URL** — set to your `*.pages.dev` URL so any auth emails link back correctly.

## Admin console
Admins are rows in `trip_admins` (Christian seeded). An **Admin** button appears in the header; it opens a console listing every circle → household → account, plus orphan accounts that never joined a circle. Actions (all server-side RPCs that check `trip_is_admin()`): move a person to any circle/household, merge a circle into another, merge a household into another (votes and roster carried over), rename, make head of household, lock/unlock votes, fix a display name, set a temporary password, delete a duplicate account, delete empty households/circles. Add another admin: `insert into trip_admins(user_id) select id from auth.users where email='…';`

## Vacation-first by default; estate-purchase track is a switch
`trip_groups.show_acquisition` (default **false**). Off: the site reads as a family-vacation planner — no LLC/syndicate copy, no investment questions, and `sale` listings are hidden by RLS (not just CSS). On: the "Master Plan" explainer, buy-target cards, acquisition prices and the capital/income questions appear. Toggle: checkbox in the circle bar (circle owner or admin) or the eye button per circle in the Admin console.

## Circles (groups)
Each extended family / friend group is a **circle** with an invite code. Parties, votes, suggestions and the party dropdown are all scoped to the circle. Listings with `group_id = null` are the shared catalog every circle sees; a row with `group_id` set is private to that circle. Christian's existing data was migrated into the circle **"Christian's Family"**. Rename: `update trip_groups set name = '…' where code = 'FAMILY-1204';`

## Currency
Header dropdown converts every structured price (`rental_amount`/`rental_currency`/`rental_unit`, `buy_amount`/`buy_currency`) into the chosen currency using live ECB rates from api.frankfurter.dev (falls back to the research payload's planning rates for EUR/GBP). Choice is saved to the user's auth metadata + localStorage. Unstructured prices show their raw text.

## Automation (GitHub Actions)
- `listing-health.yml` — weekly HEAD-check of every hero/gallery/listing URL on active cards; opens or updates an issue labelled `listing-health` on failures. Needs repo secret `SUPABASE_SERVICE_ROLE_KEY`.
- `listing-research.yml` — monthly Perplexity Sonar run of the handoff brief; writes `supabase/data/candidates-DATE.sql` and opens a PR for review. Never auto-applies. Needs secret `PERPLEXITY_API_KEY` and repo variable `PPLX_MODEL` (current deep-research model name from Perplexity's docs).

## Updating listings (the research loop)
Hand `docs/HANDOFF-listings-research.md` to a research agent (Perplexity Computer). It returns one `listings-DATE.sql`; paste it into the Supabase SQL editor. Read family suggestions first with `select * from public.trip_list_suggestions();` and paste the output into the brief.

## Adding properties
```sql
insert into public.trip_properties (id, name, location, status, details, risk, risk_level, sort) values
('craigston-castle', 'Craigston Castle', 'Aberdeenshire, Scotland', 'rental',
  array['detail 1','detail 2'], 'Risk text.', 'medium', 50);
```
`status` is `rental` or `sale`; `risk_level` is `low|medium|high`; set `active=false` to hide a card.

## Unlocking a party's votes
```sql
update public.trip_parties set votes_locked = false where code = 'SMITH-1234';
```

## Changelog
- 2026-09-30 (v6) — Vacation-first default copy throughout; acquisition track behind a per-circle switch (`show_acquisition`, off by default) enforced in RLS for sale listings; friendly intro section; toggle in circle bar and admin console.
- 2026-09-30 (v5) — Admin console: `trip_admins` + 12 admin RPCs (overview, move, merge circles/households, rename, set head, lock votes, set name, set temp password, delete account/household/circle). 14-check live test passed.
- 2026-09-29 (v4) — Circles (groups) with invite codes; all party/vote/suggestion queries scoped per circle; circle-wide tally RPC. Structured prices + header currency selector with live ECB rates. Weekly link-health and monthly research-refresh workflows. Research brief round two: price cap lifted, source diversity rule, structured price fields required.
- 2026-09-29 (v3) — `listing_url` + `gallery` on properties (modal shows thumbnails + "View original listing"); `trip_list_suggestions()` feed; research handoff doc in `docs/`.
- 2026-09-29 (v2) — Ported the full original design: 7 estates with Zillow-style modal, name-based identity (auth metadata), join-by-dropdown, ± party size (max 20), multiple date ranges (jsonb), capital + income questions, suggestion box. Votes save instantly; party tally on each card.
- 2026-09-29 — Moved to dedicated Supabase project fdlzvjdseljajjkdmdbv (schema re-applied via SQL editor, email confirmation off). Deployed to Cloudflare Pages (Git-connected). Terradex tables dropped.
- 2026-09-28 — Initial build. Schema + RLS migration applied to Terradex. Front end rewritten from the Firebase stub: Supabase auth, create/join party via RPC, head-only logistics + co-buy persistence, per-user votes with party tally, head-only vote lock, party size up to 12 (was capped at 6). Craigston / Tuscan Villa cards from the stub's TODO not seeded — no data supplied.

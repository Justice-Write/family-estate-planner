# Family Estate & Trip Planner

Static site (no build step) + Supabase. Everything in `public/` is the deployable.

## Stack
- `public/index.html` + `app.js` — the "Generational Wealth Scouting Portal" design (Tailwind CDN, FontAwesome, Playfair/Inter). Plain ES modules, no build.
- `public/vendor/supabase.js` — supabase-js v2.117.2 bundled locally (esbuild). No runtime CDN dependency.
- Supabase project **Family Estate Planner - Free** (`fdlzvjdseljajjkdmdbv`, us-east-2, org Castleborn - Free). Tables are `trip_*`.
- Publishable key is in `app.js` — that's by design; RLS is the security boundary.

## The rules (who can do what)
Enforced in Postgres by RLS — the front end only reflects them. Full SQL: `supabase/migrations/20260928_trip_planner.sql` then `20260929_v2_full_design.sql`.

| Actor | Can | Cannot |
|---|---|---|
| Anyone signed in | Read the property list | See any party, roster, budget, or vote that isn't theirs |
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
- 2026-09-29 (v2) — Ported the full original design: 7 estates with Zillow-style modal, name-based identity (auth metadata), join-by-dropdown, ± party size (max 20), multiple date ranges (jsonb), capital + income questions, suggestion box. Votes save instantly; party tally on each card.
- 2026-09-29 — Moved to dedicated Supabase project fdlzvjdseljajjkdmdbv (schema re-applied via SQL editor, email confirmation off). Deployed to Cloudflare Pages (Git-connected). Terradex tables dropped.
- 2026-09-28 — Initial build. Schema + RLS migration applied to Terradex. Front end rewritten from the Firebase stub: Supabase auth, create/join party via RPC, head-only logistics + co-buy persistence, per-user votes with party tally, head-only vote lock, party size up to 12 (was capped at 6). Craigston / Tuscan Villa cards from the stub's TODO not seeded — no data supplied.

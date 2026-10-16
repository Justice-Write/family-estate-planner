# Brief: Family trip — availability pass (2026-10-16)

**For:** Perplexity Computer. Paste this whole file.
**Site:** https://family-estate-planner.pages.dev (listings live in Supabase table `public.trip_properties`)
**Full original brief (rules, SQL format, copy style):** https://github.com/Justice-Write/family-estate-planner/blob/main/docs/HANDOFF-listings-research.md
**Current listings baseline (read first):** https://github.com/Justice-Write/family-estate-planner/blob/main/supabase/data/listings-2026-09-29.sql

---

## Why this pass is different

The trip window is **Dec 15, 2026 – Jan 5, 2027**, about eight weeks out. Exclusive-use castles over Christmas and New Year book early. The family needs a short list of rentals that are **actually open in that window** so they can vote and book. More options matter less than confirmed options.

**Skip the sale track this pass.** Do not add or edit `status = 'sale'` rows. Rentals only.

## Task 1 — Availability check on the 11 active rentals

For each id below, find out what is open between Dec 15, 2026 and Jan 5, 2027:

`craigston-castle`, `springkell-estate`, `bansha-castle`, `dairsie-castle`, `chateau-de-sadillac`, `borgo-santa-maria`, `villa-bramasole-cortona`, `lickleyhead-castle`, `springfield-castle`, `cloughan-castle`, `belle-isle-castle`

For each one, record:

1. **Open nights** in the window and the **longest unbroken open block** (e.g. "Open Dec 18–27, 9 nights"). Say whether that came from a live calendar, a reply from the owner/agency, or is only "on request".
2. **Price for those nights**, including Christmas/New Year premiums and minimum-stay rules. Listed currency plus approx. USD.
3. **Booking terms:** deposit, balance due date, cancellation policy.
4. Source URL and the date you checked.

Then update each row:

- Fully booked for the whole window → keep the row, set `active = false`, and put the reason in `risk` ("Booked Dec 15–Jan 5 per owner calendar, checked 2026-10-xx").
- Partly or fully open → keep `active = true`. Add a final sentence to `full_desc`: "Availability (checked YYYY-MM-DD): open Dec X–Y, N nights; min stay Z." Update `rental_cost`, `rental_amount`, `rental_currency`, `rental_unit` to the holiday rate if it differs.
- "On request" with no answer → keep active, say so plainly in `risk`.

## Task 2 — Replace what's gone

If fewer than **6** rentals end up confirmed open, add new rentals until there are 6, following every rental rule in the original brief §1 Track A:

- Sleeps 12+, self-catering, exclusive use, real character (castle, manor, estate, historic villa, heritage farmhouse).
- Roughly $900–$6,000/night; at least two under $1,500/night across the confirmed set.
- No single agency supplies more than a third of the rentals.
- **Every new listing must have open nights in the window confirmed.** No "plausible" availability.
- New ids in kebab-case, `sort` 80–199. Real images only (brief §2).

## Deliverables

1. `listings-2026-10-XX.sql` — one `insert … on conflict (id) do update` statement in exactly the format of brief §3. Never change an existing id; never delete rows; double single quotes (`isn''t`).
2. `notes-2026-10-XX.md` — one line per listing: id, open block, price for the window, source URL, date checked, how availability was confirmed (live calendar / owner reply / on request).
3. A summary table at the top of the notes: **id | open block | nights | holiday price (USD) | confirmed how**. Sort by price, cheapest first. This table is what the family will vote from.

Before you finish, check the SQL yourself: it parses as one statement, every id in Task 1 appears exactly once, and no `status = 'sale'` row is in the file.

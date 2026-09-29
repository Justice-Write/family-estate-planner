# Handoff: Research & update the estate listings

**Site:** https://family-estate-planner.pages.dev
**Owner:** Christian
**Your job:** research real, currently-available properties that fit the brief below, then deliver them as a single SQL file that upserts into the site's `trip_properties` table. Better descriptions, real images, source links. You are not editing the website code — the site reads listings from the database.

---

## 1. What the family is looking for

Two tracks. Every listing must be tagged as one or the other (`status`).

### Track A — `rental`: the trip itself
An exclusive-use property for one family gathering in the **Dec 15 – Jan 5** window.
- Sleeps **12 minimum**; **up to 50** is a bonus (extended family may come).
- **Self-catering.** A kitchen the family can use. Mandatory in-house catering or compulsory chef packages are a negative — call it out in `risk`.
- Exclusive use of the whole property. No shared-hotel arrangements.
- Character that justifies the flight: castle, manor, estate, historic villa, heritage farmhouse. Ordinary vacation rentals don't qualify.
- Nightly price band to cover: roughly **$900 – $6,000/night**. Include at least two under $1,500/night.
- Regions in play: Scotland, Ireland, England/Wales, France, Italy, Spain/Portugal, Japan. Others welcome if they clearly fit.

### Track B — `sale`: the generational asset
A property the family could buy through a jointly owned LLC (≈5 households pooling capital), first tested with a paid "due-diligence" stay.
- Asking price **under ~$1.1M USD**. Anything from $150k up is interesting; cheaper is not worse.
- Must be **bookable to stay in now** (or the seller/broker will arrange a trial stay) — a listing you can't visit is useless for this trip.
- Enough beds/outbuildings for family weeks **plus** surplus to rent out: ≥8 bedrooms or main house + cottages/gîtes.
- Rental income potential: note comparable nightly rates for similar properties in the area.
- Jurisdiction risk: foreign-ownership rules, financing for non-residents, heritage/listed-building restrictions, seismic/flood exposure, remoteness of infrastructure. Put this in `risk` — it's the part the family reads first.

### What good copy looks like
- `short_desc`: one line, ≤ 70 chars, the hook. ("Authentic medieval self-catering castle.")
- `full_desc`: 2–4 sentences, concrete. Beds, what's on the grounds, what's included, what the stay is like. No brochure adjectives without a fact behind them.
- `risk`: 1–2 sentences, specific, worst thing first. Leave `null` only if you looked and found nothing material.
- Prices: give the listed figure in its currency **and** an approximate USD in parentheses. Say "Est." when you're estimating. Say "Off-Market" for rentals that aren't for sale.

---

## 2. Images

- `image` = one hero image URL, landscape, ≥ 1200px wide, https.
- `gallery` = up to 6 more URLs (the modal shows them as thumbnails).
- Prefer images hosted by the listing's own site, the property's official site, or Wikimedia Commons. Airbnb/VRBO CDN links (`muscache.com`, `vrbo.com/...`) often expire or block hotlinking — if that's the only source, say so in your notes and Christian will re-host them in Supabase Storage.
- No stock photos of a *different* castle. If you can't find a real image, leave `image` as `null` and flag it.

---

## 3. Deliverable format — exactly this

One file, `listings-YYYY-MM-DD.sql`, containing one `insert … on conflict do update` statement. Christian pastes it into the Supabase SQL editor and the site updates instantly.

```sql
insert into public.trip_properties
  (id, name, location, status, sort, image, gallery, listing_url,
   short_desc, full_desc, rental_cost, buy_cost, capacity, acreage, amenities, risk, risk_level, active)
values
('slug-in-kebab-case', 'Display Name', 'Region, Country', 'rental', 80,
  'https://…/hero.jpg',
  array['https://…/1.jpg','https://…/2.jpg'],
  'https://…/the-listing',
  'One-line hook.',
  'Two to four concrete sentences.',
  '£1,900 / night (approx. $2,400)',   -- rental_cost
  'Off-Market',                        -- buy_cost  (or the asking price for status = sale)
  'Sleeps 14',                         -- capacity
  '40 Acres',                          -- acreage
  array['Amenity one','Amenity two','Amenity three'],
  'Specific risk sentence, or null.',  -- risk
  'medium',                            -- risk_level: low | medium | high
  true)
on conflict (id) do update set
  name = excluded.name, location = excluded.location, status = excluded.status, sort = excluded.sort,
  image = excluded.image, gallery = excluded.gallery, listing_url = excluded.listing_url,
  short_desc = excluded.short_desc, full_desc = excluded.full_desc,
  rental_cost = excluded.rental_cost, buy_cost = excluded.buy_cost, capacity = excluded.capacity,
  acreage = excluded.acreage, amenities = excluded.amenities, risk = excluded.risk,
  risk_level = excluded.risk_level, active = excluded.active;
```

Rules for the file:
- `id` is permanent. Reuse the existing ids below to **update** an existing card; use a new kebab-case id to **add** one. Never change an id.
- `sort` controls card order (ascending). Existing cards use 10–70. Put new rentals in 80–199, new sale targets in 200–299.
- `status` is `rental` or `sale`. `risk_level` is `low`, `medium`, or `high`.
- To retire a listing, keep its row and set `active = false` — don't delete (votes reference it).
- Escape single quotes in text by doubling them: `isn''t`.
- `details` column exists but is legacy; omit it.

### Existing ids (update these rather than duplicating)
| id | name | status |
|---|---|---|
| `turin-castle` | Turin Castle, Co. Mayo | rental |
| `craigston-castle` | Craigston Castle, Aberdeenshire | rental |
| `springkell-estate` | Springkell Estate, Dumfriesshire | rental |
| `auchen-castle` | Auchen Castle, Dumfries & Galloway | rental |
| `deux-sevres-chateau` | 17th-Century Chateau, Deux-Sèvres | sale |
| `tuscan-villa` | Tuscan Stone Villa | sale |
| `nagano-kominka` | Edo-Period Kominka, Nagano/Gifu | sale |

All seven currently have **placeholder images** and estimated prices. Verifying and replacing those is priority one; new listings are priority two.

---

## 4. Also deliver: `notes-YYYY-MM-DD.md`
For each listing: the source URL(s), the date you checked, whether Dec 15–Jan 5 availability was confirmed or just plausible, and anything you couldn't verify. Keep it short — this is the audit trail, not the copy.

---

## 5. Family suggestions (input for your next round)
Family members drop links in the site's suggestion box. Christian will paste the output of this query at the top of your next brief:

```sql
select * from public.trip_list_suggestions();
```

Treat each as a candidate to research and either add (with a real id) or reject with one line of reasoning in the notes.

---

## 6. Targets for the first pass
- Verify/replace all 7 existing cards (images, prices, availability).
- Add **4–6 rentals** across at least three countries, two of them under $1,500/night.
- Add **3–4 sale targets** under $1.1M with a trial-stay path.
- Total on the site after your pass: 14–17 cards. More than ~20 makes the vote meaningless — curate.

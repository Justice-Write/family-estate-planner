-- v2: match the full "Generational Wealth Scouting Portal" design.
-- Additive; safe to run on top of 20260928_trip_planner.sql.

alter table public.trip_parties
  add column if not exists budget_per_person      numeric,
  add column if not exists preferred_date_ranges  jsonb not null default '[]'::jsonb,
  add column if not exists cobuy_income_range     text;

alter table public.trip_party_users
  add column if not exists suggestion text;

alter table public.trip_properties
  add column if not exists image       text,
  add column if not exists short_desc  text,
  add column if not exists full_desc   text,
  add column if not exists rental_cost text,
  add column if not exists buy_cost    text,
  add column if not exists capacity    text,
  add column if not exists acreage     text,
  add column if not exists amenities   text[] not null default '{}';

-- members can update their own roster row (suggestion box)
drop policy if exists trip_party_users_update_self on public.trip_party_users;
create policy trip_party_users_update_self on public.trip_party_users for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- public-ish list of parties for the "join existing" dropdown (name + leader only)
create or replace function public.trip_list_parties()
returns table(id uuid, name text, leader_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, coalesce(u.raw_user_meta_data->>'name', 'Head of Household')
  from public.trip_parties p join auth.users u on u.id = p.head_user_id
  order by p.name
$$;

create or replace function public.trip_join_party_by_id(p_id uuid)
returns public.trip_parties language plpgsql security definer set search_path = public as $$
declare v public.trip_parties;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.trip_party_users where user_id = auth.uid()) then
    raise exception 'already in a party';
  end if;
  select * into v from public.trip_parties where id = p_id;
  if v.id is null then raise exception 'party not found'; end if;
  insert into public.trip_party_users (party_id, user_id, role) values (v.id, auth.uid(), 'member');
  return v;
end $$;

grant execute on function public.trip_list_parties()          to authenticated;
grant execute on function public.trip_join_party_by_id(uuid)  to authenticated;

-- ── Seed / refresh the seven estates ───────────────────────────────────────
insert into public.trip_properties
  (id, name, location, status, sort, image, short_desc, full_desc, rental_cost, buy_cost, capacity, acreage, amenities, risk, risk_level, details)
values
('turin-castle', 'Turin Castle', 'County Mayo, Ireland', 'rental', 10,
  'https://placehold.co/800x500/2a3f54/ffffff?text=Turin+Castle',
  'Authentic medieval self-catering castle.',
  'A unique opportunity to stay in a fully restored medieval castle. Turin Castle offers exclusive use, complete privacy, and an authentic historical atmosphere without forcing expensive commercial catering contracts.',
  '€900 / night (approx. $980)', 'Off-Market', 'Max 12 Guests', '5 Acres',
  array['Self-Catering Kitchen','Medieval Great Hall','5 En-suite Bedrooms','Private Grounds'], null, 'low', '{}'),
('craigston-castle', 'Craigston Castle', 'Aberdeenshire, Scotland', 'rental', 20,
  'https://placehold.co/800x500/1e3a8a/ffffff?text=Craigston+Castle',
  'Traditional Scottish estate, highly affordable.',
  'Craigston is a quintessential Scottish estate that provides a massive footprint for a relatively low nightly rate. Perfect for a group looking to manage their own meals while living like royalty.',
  '£1,166 / night (approx. $1,470)', 'Off-Market', 'Max 12 Guests', '250 Acres (Estate grounds)',
  array['Historic Library','Wood-burning Fireplaces','Expansive Estate Walks','Drawing Room'], null, 'low', '{}'),
('springkell-estate', 'Springkell Estate', 'Dumfriesshire, Scotland', 'rental', 30,
  'https://placehold.co/800x500/14532d/ffffff?text=Springkell+Estate',
  'Massive manicured grounds for large groups.',
  'If we expand the trip to the entire extended family, Springkell is the premier choice. A stunning Palladian mansion surrounded by immaculate gardens, offering full exclusivity for up to 50 guests.',
  '£4,250 / night (approx. $5,350)', 'Off-Market', 'Up to 50 Guests', '100+ Acres',
  array['14+ En-suite Bedrooms','Grand Reception Rooms','Formal Gardens','Helipad'], null, 'low', '{}'),
('auchen-castle', 'Auchen Castle', 'Dumfries & Galloway, Scotland', 'rental', 40,
  'https://placehold.co/800x500/4c1d95/ffffff?text=Auchen+Castle',
  '13th-century architecture with a private loch.',
  'A true fairytale Scottish castle featuring sweeping staircases, incredible 13th-century stone architecture, and its own private loch. A high-end luxury experience perfect for grand banquets.',
  '£4,050 / night (approx. $5,100)', 'Off-Market', 'Up to 50 Guests', '34 Acres',
  array['Private Loch','26 Bedrooms','Grand Staircase','Victorian Dining Room'], null, 'low', '{}'),
('deux-sevres-chateau', '17th-Century Chateau', 'Deux-Sèvres, France', 'sale', 50,
  'https://placehold.co/800x500/9d174d/ffffff?text=French+Chateau',
  'Prime acquisition target with outbuildings.',
  'An incredible acquisition opportunity. We can arrange a paid "due diligence" stay with the broker to test this massive 17th-century estate. It includes main house living and separate gîtes (guest cottages) for privacy.',
  'Est. $800 - $1,200 / night (Trial)', '€795,000 (approx. $860,000)', '15+ Guests (Main + Gîtes)', '12 Acres',
  array['Swimming Pool','Wine Cellar','Multiple Guest Cottages','Walled Garden','9 Bedrooms'],
  'Rural infrastructure limits (internet/power stability). Strict French heritage building codes complicate future renovations.', 'high', '{}'),
('tuscan-villa', 'Tuscan Stone Villa', 'Tuscany, Italy', 'sale', 60,
  'https://placehold.co/800x500/b45309/ffffff?text=Tuscan+Villa',
  'Classic Italian estate among olive groves.',
  'A sprawling stone villa nestled in the rolling hills of Tuscany. Offers the ultimate dolce vita lifestyle with potential to be a highly lucrative premium Airbnb when the family isn''t using it.',
  'Est. $1,500 / night (Trial)', '€1.5M (approx. $1.62M)', '12-16 Guests', '20 Acres (Olive Groves)',
  array['Olive Groves','Pizza Oven / Outdoor Kitchen','Infinity Pool','Terraced Gardens','8 Bedrooms'],
  'Complex foreign buyer bureaucracy. Older properties often require extensive (and expensive) plumbing and heating upgrades to meet modern winter standards.', 'high', '{}'),
('nagano-kominka', 'Edo-Period Kominka', 'Rural Japan (e.g. Nagano/Gifu)', 'sale', 70,
  'https://placehold.co/800x500/b91c1c/ffffff?text=Japanese+Kominka',
  'Massive heritage farmhouse (Akiya listing).',
  'A truly unique generational asset. These massive wooden homes feature huge exposed beams, traditional tatami rooms, and temple-like aesthetics. Heavily discounted by motivated sellers in rural areas.',
  'Est. $300 / night (Trial)', '$200,000 (Highly Negotiable)', '15+ Guests', '3 Acres',
  array['Engawa (Veranda)','Irori (Sunken Hearth)','Tatami Mat Rooms','Massive Acreage','Architectural Beams'],
  'High seismic zone (earthquakes/tsunamis require specialized insurance). Strict rural community rules and aging wooden infrastructure that requires constant upkeep.', 'high', '{}')
on conflict (id) do update set
  name = excluded.name, location = excluded.location, status = excluded.status, sort = excluded.sort,
  image = excluded.image, short_desc = excluded.short_desc, full_desc = excluded.full_desc,
  rental_cost = excluded.rental_cost, buy_cost = excluded.buy_cost, capacity = excluded.capacity,
  acreage = excluded.acreage, amenities = excluded.amenities, risk = excluded.risk, risk_level = excluded.risk_level;

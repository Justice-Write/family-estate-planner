-- v4: (1) groups — separate circles for other families; (2) structured prices for currency conversion.
-- Additive. Existing data is migrated into a default group owned by the existing party head.

-- ── 1. Groups ──────────────────────────────────────────────────────────────
create table if not exists public.trip_groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create table if not exists public.trip_group_users (
  group_id  uuid not null references public.trip_groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create unique index if not exists trip_group_users_user_idx on public.trip_group_users(user_id);

alter table public.trip_parties add column if not exists group_id uuid references public.trip_groups(id) on delete cascade;
-- Listings: null group_id = shared catalog (visible to every group); set = private to that group.
alter table public.trip_properties add column if not exists group_id uuid references public.trip_groups(id) on delete cascade;

-- Migrate existing data into a default group.
do $$
declare g uuid; h uuid;
begin
  if not exists (select 1 from public.trip_groups) then
    select head_user_id into h from public.trip_parties order by created_at limit 1;
    if h is not null then
      insert into public.trip_groups (name, code, owner_user_id)
        values ('Christian''s Family', 'FAMILY-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0'), h)
        returning id into g;
      insert into public.trip_group_users (group_id, user_id, role)
        select g, user_id, case when user_id = h then 'owner' else 'member' end from public.trip_party_users
        on conflict do nothing;
      update public.trip_parties set group_id = g where group_id is null;
    end if;
  end if;
end $$;

create or replace function public.trip_my_group_id()
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.trip_group_users where user_id = auth.uid() limit 1
$$;

create or replace function public.trip_create_group(p_name text)
returns public.trip_groups language plpgsql security definer set search_path = public as $$
declare v public.trip_groups; v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.trip_group_users where user_id = auth.uid()) then
    raise exception 'already in a group';
  end if;
  v_code := upper(regexp_replace(coalesce(nullif(trim(p_name),''),'GROUP'), '[^A-Za-z0-9]+', '', 'g'));
  v_code := left(v_code, 8) || '-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0');
  insert into public.trip_groups (name, code, owner_user_id)
    values (coalesce(nullif(trim(p_name),''), 'Our Family'), v_code, auth.uid()) returning * into v;
  insert into public.trip_group_users (group_id, user_id, role) values (v.id, auth.uid(), 'owner');
  return v;
end $$;

create or replace function public.trip_join_group(p_code text)
returns public.trip_groups language plpgsql security definer set search_path = public as $$
declare v public.trip_groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.trip_group_users where user_id = auth.uid()) then
    raise exception 'already in a group';
  end if;
  select * into v from public.trip_groups where code = upper(trim(p_code));
  if v.id is null then raise exception 'group not found'; end if;
  insert into public.trip_group_users (group_id, user_id, role) values (v.id, auth.uid(), 'member');
  return v;
end $$;

-- Party creation now requires and records the group.
create or replace function public.trip_create_party(p_name text)
returns public.trip_parties language plpgsql security definer set search_path = public as $$
declare v public.trip_parties; v_code text; g uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  g := public.trip_my_group_id();
  if g is null then raise exception 'join a group first'; end if;
  if exists (select 1 from public.trip_party_users where user_id = auth.uid()) then
    raise exception 'already in a party';
  end if;
  v_code := upper(regexp_replace(coalesce(nullif(trim(p_name),''),'PARTY'), '[^A-Za-z0-9]+', '', 'g'));
  v_code := left(v_code, 10) || '-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0');
  insert into public.trip_parties (code, name, head_user_id, group_id)
    values (v_code, coalesce(nullif(trim(p_name),''), 'Family'), auth.uid(), g) returning * into v;
  insert into public.trip_party_users (party_id, user_id, role) values (v.id, auth.uid(), 'head');
  return v;
end $$;

-- Party dropdown and suggestions are scoped to the caller's group.
create or replace function public.trip_list_parties()
returns table(id uuid, name text, leader_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, coalesce(u.raw_user_meta_data->>'name', 'Head of Household')
  from public.trip_parties p join auth.users u on u.id = p.head_user_id
  where p.group_id = public.trip_my_group_id()
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
  select * into v from public.trip_parties where id = p_id and group_id = public.trip_my_group_id();
  if v.id is null then raise exception 'party not found'; end if;
  insert into public.trip_party_users (party_id, user_id, role) values (v.id, auth.uid(), 'member');
  return v;
end $$;

create or replace function public.trip_list_suggestions()
returns table(party_name text, member_name text, suggestion text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, coalesce(u.raw_user_meta_data->>'name', u.email), pu.suggestion, pu.joined_at
  from public.trip_party_users pu
  join public.trip_parties p on p.id = pu.party_id
  join auth.users u on u.id = pu.user_id
  where pu.suggestion is not null and pu.suggestion <> ''
    and p.group_id = public.trip_my_group_id()
  order by p.name
$$;

-- Group-wide vote tally so every family in a circle sees the same leaderboard.
create or replace function public.trip_group_tally()
returns table(property_id text, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.property_id, count(*)
  from public.trip_votes v join public.trip_parties p on p.id = v.party_id
  where p.group_id = public.trip_my_group_id()
  group by v.property_id
$$;

alter table public.trip_groups enable row level security;
alter table public.trip_group_users enable row level security;
drop policy if exists trip_groups_select on public.trip_groups;
create policy trip_groups_select on public.trip_groups for select to authenticated
  using (id = public.trip_my_group_id());
drop policy if exists trip_groups_update on public.trip_groups;
create policy trip_groups_update on public.trip_groups for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists trip_group_users_select on public.trip_group_users;
create policy trip_group_users_select on public.trip_group_users for select to authenticated
  using (group_id = public.trip_my_group_id());

-- Listings: shared catalog OR your group's private rows; only active.
drop policy if exists trip_properties_select on public.trip_properties;
create policy trip_properties_select on public.trip_properties for select to authenticated
  using (active and (group_id is null or group_id = public.trip_my_group_id()));

grant execute on function public.trip_my_group_id()          to authenticated;
grant execute on function public.trip_create_group(text)     to authenticated;
grant execute on function public.trip_join_group(text)       to authenticated;
grant execute on function public.trip_group_tally()          to authenticated;

-- ── 2. Structured prices ───────────────────────────────────────────────────
alter table public.trip_properties
  add column if not exists rental_amount   numeric,
  add column if not exists rental_currency text check (rental_currency is null or rental_currency ~ '^[A-Z]{3}$'),
  add column if not exists rental_unit     text,   -- 'night' | 'week' | '3 nights' | 'day' | ...
  add column if not exists buy_amount      numeric,
  add column if not exists buy_currency    text check (buy_currency is null or buy_currency ~ '^[A-Z]{3}$');

-- Backfill from the 2026-09-29 payload text (parsed; Posada's "comparator" price deliberately left null).
update public.trip_properties p set rental_amount = v.ra, rental_currency = v.rc, rental_unit = v.ru, buy_amount = v.ba, buy_currency = v.bc
from (values
  ('turin-castle',            3500, 'EUR', 'week',     null::numeric, null),
  ('craigston-castle',        3500, 'GBP', 'week',     null, null),
  ('springkell-estate',       2750, 'GBP', 'night',    null, null),
  ('auchen-castle',           1995, 'GBP', 'day',      null, null),
  ('bansha-castle',           5700, 'EUR', 'week',     null, null),
  ('dairsie-castle',          4500, 'GBP', 'week',     null, null),
  ('chateau-de-sadillac',     1000, 'EUR', 'night',    null, null),
  ('borgo-santa-maria',       2200, 'EUR', 'night',    null, null),
  ('villa-bramasole-cortona', 25000,'EUR', 'week',     null, null),
  ('lickleyhead-castle',      2460, 'GBP', '3 nights', 1150000, 'GBP'),
  ('springfield-castle',      11550,'EUR', '7 nights', null, null),
  ('cloughan-castle',         9000, 'EUR', '2 nights', null, null),
  ('belle-isle-castle',       3600, 'GBP', 'night',    null, null),
  ('casa-campana-arcos',      67,   'EUR', 'room-night', 395000, 'EUR'),
  ('posada-los-cantaros',     null, null,  null,       760000, 'EUR'),
  ('ptitmonde-vosges',        83,   'EUR', 'room-night', 592000, 'EUR')
) as v(id, ra, rc, ru, ba, bc)
where p.id = v.id;

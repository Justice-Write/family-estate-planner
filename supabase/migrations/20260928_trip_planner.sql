-- Family Estate & Trip Planner — schema + RLS
-- Namespaced with trip_ prefix; lives alongside Terradex tables in public.

create extension if not exists pgcrypto;

-- ── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.trip_parties (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,
  name                   text not null,
  head_user_id           uuid not null references auth.users(id) on delete cascade,
  budget_total           numeric,
  budget_per_person_day  numeric,
  preferred_dates        text,
  cobuy_interest         boolean not null default false,
  cobuy_capital_range    text,
  cobuy_coborrow         text,
  votes_locked           boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.trip_party_users (
  party_id   uuid not null references public.trip_parties(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('head','member')),
  joined_at  timestamptz not null default now(),
  primary key (party_id, user_id)
);
-- one party per user
create unique index if not exists trip_party_users_user_idx on public.trip_party_users(user_id);

create table if not exists public.trip_party_members (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.trip_parties(id) on delete cascade,
  position   int  not null,
  name       text,
  age        int,
  needs      text,
  unique (party_id, position)
);

create table if not exists public.trip_properties (
  id         text primary key,
  name       text not null,
  location   text not null,
  status     text not null check (status in ('rental','sale')),
  details    text[] not null default '{}',
  risk       text,
  risk_level text not null default 'high' check (risk_level in ('low','medium','high')),
  sort       int not null default 100,
  active     boolean not null default true
);

create table if not exists public.trip_votes (
  party_id    uuid not null references public.trip_parties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  property_id text not null references public.trip_properties(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);

-- ── Helpers (security definer: bypass RLS, no recursion) ───────────────────
create or replace function public.trip_my_party_id()
returns uuid language sql stable security definer set search_path = public as $$
  select party_id from public.trip_party_users where user_id = auth.uid() limit 1
$$;

create or replace function public.trip_is_head(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_parties where id = p and head_user_id = auth.uid())
$$;

create or replace function public.trip_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trip_parties_touch on public.trip_parties;
create trigger trip_parties_touch before update on public.trip_parties
  for each row execute function public.trip_touch();

-- Create a party: inserts party + head membership atomically, returns party.
create or replace function public.trip_create_party(p_name text)
returns public.trip_parties language plpgsql security definer set search_path = public as $$
declare v public.trip_parties; v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.trip_party_users where user_id = auth.uid()) then
    raise exception 'already in a party';
  end if;
  v_code := upper(regexp_replace(coalesce(nullif(trim(p_name),''),'PARTY'), '[^A-Za-z0-9]+', '', 'g'));
  v_code := left(v_code, 10) || '-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0');
  insert into public.trip_parties (code, name, head_user_id)
    values (v_code, coalesce(nullif(trim(p_name),''), 'Family'), auth.uid()) returning * into v;
  insert into public.trip_party_users (party_id, user_id, role) values (v.id, auth.uid(), 'head');
  return v;
end $$;

-- Join by code: secondary members link to an existing party.
create or replace function public.trip_join_party(p_code text)
returns public.trip_parties language plpgsql security definer set search_path = public as $$
declare v public.trip_parties;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.trip_party_users where user_id = auth.uid()) then
    raise exception 'already in a party';
  end if;
  select * into v from public.trip_parties where code = upper(trim(p_code));
  if v.id is null then raise exception 'party not found'; end if;
  insert into public.trip_party_users (party_id, user_id, role) values (v.id, auth.uid(), 'member');
  return v;
end $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.trip_parties       enable row level security;
alter table public.trip_party_users   enable row level security;
alter table public.trip_party_members enable row level security;
alter table public.trip_properties    enable row level security;
alter table public.trip_votes         enable row level security;

-- parties: members read; only head edits; create/join only via RPC
drop policy if exists trip_parties_select on public.trip_parties;
create policy trip_parties_select on public.trip_parties for select to authenticated
  using (id = public.trip_my_party_id());
drop policy if exists trip_parties_update on public.trip_parties;
create policy trip_parties_update on public.trip_parties for update to authenticated
  using (head_user_id = auth.uid()) with check (head_user_id = auth.uid());

-- party_users: see your own party's roster; writes only via RPC
drop policy if exists trip_party_users_select on public.trip_party_users;
create policy trip_party_users_select on public.trip_party_users for select to authenticated
  using (party_id = public.trip_my_party_id());

-- party_members (the headcount): party reads; head writes
drop policy if exists trip_members_select on public.trip_party_members;
create policy trip_members_select on public.trip_party_members for select to authenticated
  using (party_id = public.trip_my_party_id());
drop policy if exists trip_members_write on public.trip_party_members;
create policy trip_members_write on public.trip_party_members for all to authenticated
  using (public.trip_is_head(party_id)) with check (public.trip_is_head(party_id));

-- properties: any signed-in user reads; edited only from SQL editor / service role
drop policy if exists trip_properties_select on public.trip_properties;
create policy trip_properties_select on public.trip_properties for select to authenticated
  using (active);

-- votes: party reads all its votes; each user manages own votes until the head locks
drop policy if exists trip_votes_select on public.trip_votes;
create policy trip_votes_select on public.trip_votes for select to authenticated
  using (party_id = public.trip_my_party_id());
drop policy if exists trip_votes_insert on public.trip_votes;
create policy trip_votes_insert on public.trip_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and party_id = public.trip_my_party_id()
    and not exists (select 1 from public.trip_parties p where p.id = party_id and p.votes_locked)
  );
drop policy if exists trip_votes_delete on public.trip_votes;
create policy trip_votes_delete on public.trip_votes for delete to authenticated
  using (
    user_id = auth.uid()
    and not exists (select 1 from public.trip_parties p where p.id = party_id and p.votes_locked)
  );

grant execute on function public.trip_create_party(text) to authenticated;
grant execute on function public.trip_join_party(text)   to authenticated;
grant execute on function public.trip_my_party_id()      to authenticated;
grant execute on function public.trip_is_head(uuid)      to authenticated;

-- ── Seed: the four properties from the brief ───────────────────────────────
insert into public.trip_properties (id, name, location, status, details, risk, risk_level, sort) values
('auchen-castle', 'Auchen Castle', 'Dumfries & Galloway, Scotland', 'rental',
  array['26 Bedrooms | 26 Baths','~$1,377 / person (17 nights)','Mandatory in-house catering'],
  'High seasonal costs; no asset acquisition path.', 'high', 10),
('turin-castle', 'Turin Castle', 'County Mayo, Ireland', 'rental',
  array['Sleeps 12 | 13th Century','~$900/night total','Fully self-catered (chef add-on available)'],
  'Peak holiday flight premiums apply.', 'medium', 20),
('deux-sevres-chateau', '17th-Century Chateau', 'Deux-Sèvres, France', 'sale',
  array['9 Bedrooms + 3 Gîtes (cottages)','Asking: €795,000','Strategy: paid due-diligence stay'],
  'Aging rural infrastructure; potential roof/stone maintenance liabilities.', 'high', 30),
('nagano-kominka', 'Edo-Period Kominka', 'Nagano Prefecture, Japan', 'sale',
  array['Massive open-plan tatami floor','Asking: ¥25,000,000 (~$170k USD)','Strategy: Akiya Bank negotiation'],
  'Seismic zone (structural retrofit checks); strict foreign-ownership banking rules.', 'high', 40)
on conflict (id) do nothing;

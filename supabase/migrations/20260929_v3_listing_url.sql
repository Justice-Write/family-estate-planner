-- v3: source link per listing + a head-readable suggestions feed.
alter table public.trip_properties add column if not exists listing_url text;
alter table public.trip_properties add column if not exists gallery text[] not null default '{}';

-- Every family member's suggestion, readable by anyone signed in (it's a wishlist, not private data).
create or replace function public.trip_list_suggestions()
returns table(party_name text, member_name text, suggestion text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, coalesce(u.raw_user_meta_data->>'name', u.email), pu.suggestion, pu.joined_at
  from public.trip_party_users pu
  join public.trip_parties p on p.id = pu.party_id
  join auth.users u on u.id = pu.user_id
  where pu.suggestion is not null and pu.suggestion <> ''
  order by p.name
$$;
grant execute on function public.trip_list_suggestions() to authenticated;

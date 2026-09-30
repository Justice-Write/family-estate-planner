-- v5: admin console. Admins are listed in trip_admins; every admin action is a security-definer RPC that checks it.

create table if not exists public.trip_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.trip_admins enable row level security;
-- nobody reads this table directly; trip_is_admin() is the only accessor

-- Seed: the owner of the first circle (Christian).
insert into public.trip_admins (user_id)
  select owner_user_id from public.trip_groups order by created_at limit 1
on conflict do nothing;

create or replace function public.trip_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_admins where user_id = auth.uid())
$$;
grant execute on function public.trip_is_admin() to authenticated;

create or replace function public.trip_require_admin() returns void language plpgsql as $$
begin if not public.trip_is_admin() then raise exception 'admin only'; end if; end $$;

-- ── Overview: everything, for the admin panel ──────────────────────────────
create or replace function public.trip_admin_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.trip_require_admin();
  select jsonb_build_object(
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'code', g.code, 'created_at', g.created_at,
        'owner_email', (select email from auth.users where id = g.owner_user_id),
        'members', (select count(*) from public.trip_group_users gu where gu.group_id = g.id),
        'parties', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name, 'code', p.code, 'votes_locked', p.votes_locked,
            'head_user_id', p.head_user_id,
            'head_email', (select email from auth.users where id = p.head_user_id),
            'headcount', (select count(*) from public.trip_party_members m where m.party_id = p.id),
            'budget_total', p.budget_total,
            'users', (select coalesce(jsonb_agg(jsonb_build_object(
                'user_id', pu.user_id, 'role', pu.role,
                'email', u.email, 'name', u.raw_user_meta_data->>'name',
                'last_sign_in', u.last_sign_in_at,
                'votes', (select count(*) from public.trip_votes v where v.user_id = pu.user_id),
                'suggestion', pu.suggestion
              ) order by pu.role, u.email), '[]'::jsonb)
              from public.trip_party_users pu join auth.users u on u.id = pu.user_id where pu.party_id = p.id)
          ) order by p.name), '[]'::jsonb)
          from public.trip_parties p where p.group_id = g.id),
        'unassigned', (select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', gu.user_id, 'email', u.email, 'name', u.raw_user_meta_data->>'name', 'last_sign_in', u.last_sign_in_at)), '[]'::jsonb)
            from public.trip_group_users gu join auth.users u on u.id = gu.user_id
            where gu.group_id = g.id and not exists (select 1 from public.trip_party_users pu where pu.user_id = gu.user_id))
      ) order by g.created_at), '[]'::jsonb) from public.trip_groups g),
    'orphans', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', u.id, 'email', u.email, 'name', u.raw_user_meta_data->>'name', 'created_at', u.created_at, 'last_sign_in', u.last_sign_in_at)), '[]'::jsonb)
        from auth.users u where not exists (select 1 from public.trip_group_users gu where gu.user_id = u.id)),
    'admins', (select coalesce(jsonb_agg(u.email), '[]'::jsonb) from public.trip_admins a join auth.users u on u.id = a.user_id)
  ) into out;
  return out;
end $$;

-- ── Moves & merges ─────────────────────────────────────────────────────────
-- Put a user into a circle (and optionally a party in that circle). Removes them from wherever they were.
create or replace function public.trip_admin_move_user(p_user uuid, p_group uuid, p_party uuid default null, p_role text default 'member')
returns void language plpgsql security definer set search_path = public as $$
declare old_party uuid;
begin
  perform public.trip_require_admin();
  if p_party is not null and not exists (select 1 from public.trip_parties where id = p_party and group_id = p_group) then
    raise exception 'party is not in that circle';
  end if;
  select party_id into old_party from public.trip_party_users where user_id = p_user;
  -- leaving a party they head: hand headship to another member, or leave the party headless-but-intact
  if old_party is not null and old_party is distinct from p_party then
    if exists (select 1 from public.trip_parties where id = old_party and head_user_id = p_user) then
      update public.trip_parties set head_user_id = coalesce(
        (select user_id from public.trip_party_users where party_id = old_party and user_id <> p_user limit 1), head_user_id)
      where id = old_party;
    end if;
    delete from public.trip_party_users where user_id = p_user;
    delete from public.trip_votes where user_id = p_user and party_id = old_party;
  end if;
  delete from public.trip_group_users where user_id = p_user;
  insert into public.trip_group_users (group_id, user_id, role)
    values (p_group, p_user, case when p_role = 'owner' then 'owner' else 'member' end);
  if p_party is not null and old_party is distinct from p_party then
    insert into public.trip_party_users (party_id, user_id, role) values (p_party, p_user, 'member');
  end if;
end $$;

-- Merge party A into party B (same or different circle): members, votes, roster rows move; A is deleted.
create or replace function public.trip_admin_merge_parties(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid; maxpos int;
begin
  perform public.trip_require_admin();
  if p_from = p_into then raise exception 'same party'; end if;
  select group_id into g from public.trip_parties where id = p_into;
  -- users
  update public.trip_party_users set party_id = p_into, role = 'member' where party_id = p_from;
  update public.trip_group_users gu set group_id = g where gu.user_id in (select user_id from public.trip_party_users where party_id = p_into) and gu.group_id <> g;
  -- votes: re-point, dropping duplicates on (user, property)
  update public.trip_votes set party_id = p_into where party_id = p_from;
  -- roster members: append after existing positions
  select coalesce(max(position), 0) into maxpos from public.trip_party_members where party_id = p_into;
  update public.trip_party_members set party_id = p_into, position = position + maxpos where party_id = p_from;
  delete from public.trip_parties where id = p_from;
end $$;

-- Merge circle A into circle B: all parties and members move; A is deleted.
create or replace function public.trip_admin_merge_groups(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trip_require_admin();
  if p_from = p_into then raise exception 'same circle'; end if;
  update public.trip_parties set group_id = p_into where group_id = p_from;
  update public.trip_properties set group_id = p_into where group_id = p_from;
  update public.trip_group_users set group_id = p_into, role = 'member' where group_id = p_from
    and user_id not in (select user_id from public.trip_group_users where group_id = p_into);
  delete from public.trip_group_users where group_id = p_from;
  delete from public.trip_groups where id = p_from;
end $$;

create or replace function public.trip_admin_rename(p_kind text, p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trip_require_admin();
  if p_kind = 'group' then update public.trip_groups set name = p_name where id = p_id;
  elsif p_kind = 'party' then update public.trip_parties set name = p_name where id = p_id;
  else raise exception 'kind must be group or party'; end if;
end $$;

create or replace function public.trip_admin_set_head(p_party uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trip_require_admin();
  if not exists (select 1 from public.trip_party_users where party_id = p_party and user_id = p_user) then
    raise exception 'user is not in that party';
  end if;
  update public.trip_parties set head_user_id = p_user where id = p_party;
  update public.trip_party_users set role = case when user_id = p_user then 'head' else 'member' end where party_id = p_party;
end $$;

create or replace function public.trip_admin_lock_votes(p_party uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.trip_require_admin(); update public.trip_parties set votes_locked = p_locked where id = p_party; end $$;

-- Delete a duplicate/abandoned account entirely (cascades: memberships, votes; a party they head survives, re-headed if possible).
create or replace function public.trip_admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  perform public.trip_require_admin();
  if p_user = auth.uid() then raise exception 'cannot delete yourself'; end if;
  if exists (select 1 from public.trip_admins where user_id = p_user) then raise exception 'cannot delete an admin'; end if;
  for p in select id from public.trip_parties where head_user_id = p_user loop
    update public.trip_parties set head_user_id = coalesce(
      (select user_id from public.trip_party_users where party_id = p and user_id <> p_user limit 1), head_user_id) where id = p;
  end loop;
  -- a party nobody else is in dies with the account
  delete from public.trip_parties where head_user_id = p_user
    and not exists (select 1 from public.trip_party_users pu where pu.party_id = trip_parties.id and pu.user_id <> p_user);
  delete from auth.users where id = p_user;
end $$;

-- Delete an empty party or circle.
create or replace function public.trip_admin_delete_party(p_party uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.trip_require_admin(); delete from public.trip_parties where id = p_party; end $$;
create or replace function public.trip_admin_delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trip_require_admin();
  if exists (select 1 from public.trip_group_users where group_id = p_group) then raise exception 'circle still has members — move or merge them first'; end if;
  delete from public.trip_groups where id = p_group;
end $$;

-- Forgot-password fix: admin sets a temporary password; tell the person to change it after.
create or replace function public.trip_admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.trip_require_admin();
  if length(p_password) < 8 then raise exception 'password must be 8+ characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

-- Fix a member's display name (people typo their own names).
create or replace function public.trip_admin_set_name(p_user uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trip_require_admin();
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', p_name) where id = p_user;
end $$;

grant execute on function public.trip_admin_overview()                        to authenticated;
grant execute on function public.trip_admin_move_user(uuid, uuid, uuid, text)  to authenticated;
grant execute on function public.trip_admin_merge_parties(uuid, uuid)         to authenticated;
grant execute on function public.trip_admin_merge_groups(uuid, uuid)          to authenticated;
grant execute on function public.trip_admin_rename(text, uuid, text)          to authenticated;
grant execute on function public.trip_admin_set_head(uuid, uuid)              to authenticated;
grant execute on function public.trip_admin_lock_votes(uuid, boolean)         to authenticated;
grant execute on function public.trip_admin_delete_user(uuid)                 to authenticated;
grant execute on function public.trip_admin_delete_party(uuid)                to authenticated;
grant execute on function public.trip_admin_delete_group(uuid)                to authenticated;
grant execute on function public.trip_admin_set_password(uuid, text)          to authenticated;
grant execute on function public.trip_admin_set_name(uuid, text)              to authenticated;

-- v6: per-circle "show estate-purchase track" switch, off by default. Sale listings and all
-- co-ownership copy stay hidden unless the circle owner or an admin turns it on.
alter table public.trip_groups add column if not exists show_acquisition boolean not null default false;

create or replace function public.trip_set_group_acquisition(p_group uuid, p_show boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (public.trip_is_admin() or exists (select 1 from public.trip_groups where id = p_group and owner_user_id = auth.uid())) then
    raise exception 'only the circle owner or an admin can change this';
  end if;
  update public.trip_groups set show_acquisition = p_show where id = p_group;
end $$;
grant execute on function public.trip_set_group_acquisition(uuid, boolean) to authenticated;

drop policy if exists trip_properties_select on public.trip_properties;
create policy trip_properties_select on public.trip_properties for select to authenticated
  using (
    active
    and (group_id is null or group_id = public.trip_my_group_id())
    and (status <> 'sale' or exists (select 1 from public.trip_groups g where g.id = public.trip_my_group_id() and g.show_acquisition))
  );
-- trip_admin_overview also gained 'show_acquisition' per group (re-created; see v5 for the body).

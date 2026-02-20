do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'events_pricing_tier_check'
  ) then
    alter table public.events
      drop constraint events_pricing_tier_check;
  end if;
end $$;

alter table public.events
  add constraint events_pricing_tier_check
  check (pricing_tier in ('economy', 'business', 'first_class', 'budget'));


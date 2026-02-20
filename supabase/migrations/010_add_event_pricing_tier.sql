alter table public.events
  add column if not exists pricing_tier text not null default 'economy';

alter table public.events
  add constraint events_pricing_tier_check check (pricing_tier in ('economy', 'business', 'first_class'));

alter table public.ingredient_packs
  add column if not exists purchase_url text;

alter table public.ingredient_packs
  add column if not exists tier text;

update public.ingredient_packs
set tier = 'economy'
where tier is null;

alter table public.ingredient_packs
  alter column tier set not null;

alter table public.ingredient_packs
  alter column tier set default 'economy';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredient_packs_tier_check'
  ) then
    alter table public.ingredient_packs
      add constraint ingredient_packs_tier_check check (tier in ('economy', 'business', 'first_class'));
  end if;
end $$;

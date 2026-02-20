alter table public.ingredient_packs
  add column if not exists retailer text,
  add column if not exists search_query text,
  add column if not exists search_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredient_packs_retailer_check'
  ) then
    alter table public.ingredient_packs
      add constraint ingredient_packs_retailer_check
      check (retailer is null or retailer in ('danmurphys', 'woolworths', 'getinvolved'));
  end if;
end $$;


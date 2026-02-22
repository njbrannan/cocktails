alter table public.ingredient_packs
  add column if not exists variant_sku text;


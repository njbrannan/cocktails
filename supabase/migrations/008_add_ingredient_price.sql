alter table public.ingredients
  add column if not exists price numeric;

alter table public.ingredients
  add constraint ingredients_price_check check (price is null or price >= 0);


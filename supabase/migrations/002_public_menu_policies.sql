-- Allow the public (anon) request page to read active recipes + linked ingredients.
-- This does NOT allow inserts/updates/deletes.

alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

drop policy if exists "Public can read ingredients" on ingredients;
create policy "Public can read ingredients" on ingredients
  for select using (true);

drop policy if exists "Public can read active recipes" on recipes;
create policy "Public can read active recipes" on recipes
  for select using (is_active = true);

drop policy if exists "Public can read ingredients for active recipes" on recipe_ingredients;
create policy "Public can read ingredients for active recipes" on recipe_ingredients
  for select using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.is_active = true
    )
  );


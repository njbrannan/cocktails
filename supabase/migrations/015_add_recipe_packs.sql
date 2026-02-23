create table if not exists public.recipe_packs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  pack_size numeric not null,
  pack_price numeric not null,
  purchase_url text,
  variant_sku text,
  tier text not null default 'economy',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipe_packs_recipe_id_idx on public.recipe_packs(recipe_id);

alter table public.recipe_packs enable row level security;

-- Prices + pack sizes are not sensitive; allow public read so the menu builder can estimate totals and cost.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_packs'
      and policyname = 'Public read recipe_packs'
  ) then
    create policy "Public read recipe_packs"
      on public.recipe_packs
      for select
      using (true);
  end if;
end $$;

-- Keep pack_size / pack_price sane.
alter table public.recipe_packs
  add constraint recipe_packs_pack_size_check check (pack_size > 0);

alter table public.recipe_packs
  add constraint recipe_packs_pack_price_check check (pack_price >= 0);

alter table public.recipe_packs
  add constraint recipe_packs_tier_check check (tier in ('economy', 'business', 'first_class'));


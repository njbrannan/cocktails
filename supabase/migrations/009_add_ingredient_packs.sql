create table if not exists public.ingredient_packs (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  pack_size numeric not null,
  pack_price numeric not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingredient_packs_ingredient_id_idx on public.ingredient_packs(ingredient_id);

alter table public.ingredient_packs enable row level security;

-- Prices + pack sizes are not sensitive; allow public read so the menu builder can estimate totals and cost.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredient_packs'
      and policyname = 'Public read ingredient_packs'
  ) then
    create policy "Public read ingredient_packs"
      on public.ingredient_packs
      for select
      using (true);
  end if;
end $$;

-- Keep pack_size / pack_price sane.
alter table public.ingredient_packs
  add constraint ingredient_packs_pack_size_check check (pack_size > 0);

alter table public.ingredient_packs
  add constraint ingredient_packs_pack_price_check check (pack_price >= 0);


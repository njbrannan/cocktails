create extension if not exists "uuid-ossp";

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'client',
  created_at timestamptz default now()
);

create table if not exists ingredients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('liquor', 'mixer', 'juice', 'syrup', 'garnish', 'ice', 'glassware')),
  bottle_size_ml integer,
  unit text default 'ml',
  created_at timestamptz default now()
);

create table if not exists recipes (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  image_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid references recipes on delete cascade,
  ingredient_id uuid references ingredients on delete cascade,
  ml_per_serving integer not null,
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references auth.users on delete set null,
  client_email text,
  client_phone text,
  title text,
  event_date date,
  guest_count integer,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed')),
  notes text,
  public_token uuid default uuid_generate_v4(),
  edit_token uuid default uuid_generate_v4(),
  created_at timestamptz default now()
);

create table if not exists event_recipes (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events on delete cascade,
  recipe_id uuid references recipes on delete cascade,
  servings integer not null default 0,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'client');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table profiles enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table events enable row level security;
alter table event_recipes enable row level security;

create policy "Clients can view their profile" on profiles
  for select using (auth.uid() = id);

create policy "Clients can update their profile" on profiles
  for update using (auth.uid() = id);

create policy "Admins manage ingredients" on ingredients
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Public can read ingredients" on ingredients
  for select using (true);

create policy "Admins manage recipes" on recipes
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Public can read active recipes" on recipes
  for select using (is_active = true);

create policy "Admins manage recipe ingredients" on recipe_ingredients
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Public can read ingredients for active recipes" on recipe_ingredients
  for select using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.is_active = true
    )
  );

create policy "Clients manage own events" on events
  for all using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

create policy "Admins manage all events" on events
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Clients manage own event recipes" on event_recipes
  for all using (
    exists (
      select 1 from events e where e.id = event_recipes.event_id and e.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from events e where e.id = event_recipes.event_id and e.client_id = auth.uid()
    )
  );

create policy "Admins manage all event recipes" on event_recipes
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

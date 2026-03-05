-- Availability slots for booking (admin-managed)

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_slots_end_after_start check (end_ts > start_ts)
);

alter table public.availability_slots enable row level security;

-- Public can read availability (so clients can validate slots).
drop policy if exists "availability_slots_select_all" on public.availability_slots;
create policy "availability_slots_select_all"
on public.availability_slots
for select
using (true);

-- Only admins can write.
drop policy if exists "availability_slots_admin_write" on public.availability_slots;
create policy "availability_slots_admin_write"
on public.availability_slots
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_availability_slots_updated_at on public.availability_slots;
create trigger trg_availability_slots_updated_at
before update on public.availability_slots
for each row
execute function public.set_updated_at();


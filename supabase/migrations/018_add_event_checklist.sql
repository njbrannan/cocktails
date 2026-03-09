-- Admin checklist for fulfilling a specific booking (event).
-- Stores which items have been purchased/confirmed.

create table if not exists event_checklist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  key text not null,
  label text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, key)
);

-- Helpful index for admin lookups.
create index if not exists event_checklist_event_id_idx on event_checklist(event_id);


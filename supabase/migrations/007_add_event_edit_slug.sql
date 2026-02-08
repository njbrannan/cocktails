-- Human-friendly, unguessable-ish URL token for edit links.
-- Keep existing UUID `edit_token` working for backwards compatibility.

alter table events
  add column if not exists edit_slug text;

create unique index if not exists events_edit_slug_unique
  on events (edit_slug)
  where edit_slug is not null;


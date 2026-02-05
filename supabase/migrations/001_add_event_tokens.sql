alter table events add column if not exists client_email text;
alter table events add column if not exists public_token uuid default uuid_generate_v4();
alter table events add column if not exists edit_token uuid default uuid_generate_v4();

-- A session records one thing: her errors (her half) or ball placements (the far half).
alter table public.sessions add column if not exists mode text not null default 'errors';

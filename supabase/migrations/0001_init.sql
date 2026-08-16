-- Tennis Marker — initial schema.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run: everything is IF NOT EXISTS / OR REPLACE.

create table if not exists public.sessions (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default '',
  date        date not null,
  kind        text not null default 'practice' check (kind in ('match', 'practice')),
  notes       text not null default '',
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  deleted_at  timestamptz
);

create table if not exists public.points (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  -- position in court feet, in the player's frame: x 0 = center line (+ = deuce side); y 0 = net, 39 = baseline
  x           real not null,
  y           real not null,
  stroke      text not null,                       -- 'fh' | 'bh' (kept open for volley/overhead later)
  error_type  text not null,                       -- 'long' | 'net' | 'wide'
  forced      boolean not null default false,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  deleted_at  timestamptz
);

create index if not exists points_user_session_idx on public.points (user_id, session_id);
create index if not exists sessions_user_updated_idx on public.sessions (user_id, updated_at);
create index if not exists points_user_updated_idx on public.points (user_id, updated_at);

alter table public.sessions enable row level security;
alter table public.points enable row level security;

-- Each signed-in user sees and writes only their own rows. Upsert needs insert + update (+ select for reads).
drop policy if exists own_sessions on public.sessions;
create policy own_sessions on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists own_points on public.points;
create policy own_points on public.points
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

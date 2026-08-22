-- Finished sessions are read-only in the recorder until the user explicitly unlocks them.
alter table public.sessions add column if not exists finished_at timestamptz;

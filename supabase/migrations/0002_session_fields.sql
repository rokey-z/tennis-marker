-- Session titles were replaced by a derived label (kind + opponent + date).
-- Adds the opponent and venue fields; the legacy `title` column stays so older rows keep their name.
alter table public.sessions add column if not exists opponent text not null default '';
alter table public.sessions add column if not exists venue text not null default '';

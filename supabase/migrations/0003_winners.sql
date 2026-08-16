-- Points can now record a winner she hit, not only an error she made.
-- Winners store an empty error_type, so the existing NOT NULL column is untouched.
alter table public.points add column if not exists outcome text not null default 'error';

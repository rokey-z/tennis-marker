-- Editable 1–5 self-assessment captured when a session is finished.
alter table public.sessions add column if not exists self_rating smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_self_rating_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_self_rating_check
      check (self_rating is null or self_rating between 1 and 5);
  end if;
end $$;

-- Widen projects that already applied 0006 while ratings used a five-point scale.
alter table public.sessions
  drop constraint if exists sessions_self_rating_check;

alter table public.sessions
  add constraint sessions_self_rating_check
  check (self_rating is null or self_rating between 1 and 100);

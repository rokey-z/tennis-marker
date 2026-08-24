-- A winning serve is a point won through a return error, not an ace/player winner.
-- Keep it as a separate outcome so winner calculations cannot accidentally include it.
alter table public.points
  drop constraint if exists points_outcome_check;

alter table public.points
  add constraint points_outcome_check
  check (outcome in ('error', 'winner', 'player_winner', 'winning_serve', 'placement'));

notify pgrst, 'reload schema';

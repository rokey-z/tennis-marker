-- Record winners hit by the player separately from opponent winners and errors.
-- No new column is needed: outcome is already text, and shot_type/stroke already store the details.
alter table public.points
  drop constraint if exists points_outcome_check;

alter table public.points
  add constraint points_outcome_check
  check (outcome in ('error', 'winner', 'player_winner', 'placement'));

notify pgrst, 'reload schema';

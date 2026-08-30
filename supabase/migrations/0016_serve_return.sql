-- Track serve-return errors as a distinct ball type.
alter table public.points
  drop constraint if exists points_shot_type_check;

alter table public.points
  add constraint points_shot_type_check
  check (
    shot_type is null or shot_type in (
      'ground',
      'slice',
      'approach',
      'serve_return',
      'volley',
      'swing_volley',
      'overhead',
      'lob',
      'drop',
      'winning_serve',
      'ace',
      'double_fault'
    )
  );

notify pgrst, 'reload schema';

-- Opponent UTR is a snapshot on each session, never a property of the reusable opponent name.
alter table public.sessions add column if not exists opponent_utr numeric(4, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_opponent_utr_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_opponent_utr_check
      check (opponent_utr is null or opponent_utr between 0.01 and 16.50);
  end if;
end $$;

-- Refresh the live public share payload so UTR appears beside the opponent there too.
create or replace function public.get_shared_match(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id,
      'user_id', null,
      'title', s.title,
      'opponent', s.opponent,
      'opponent_utr', s.opponent_utr,
      'venue', s.venue,
      'date', s.date,
      'kind', s.kind,
      'mode', s.mode,
      'notes', s.notes,
      'finished_at', s.finished_at,
      'self_rating', s.self_rating,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'deleted_at', null
    ),
    'points', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'user_id', null,
          'session_id', p.session_id,
          'x', p.x,
          'y', p.y,
          'stroke', p.stroke,
          'error_type', p.error_type,
          'forced', p.forced,
          'outcome', p.outcome,
          'placement_result', p.placement_result,
          'shot_type', p.shot_type,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'deleted_at', null
        ) order by p.created_at, p.id
      )
      from public.points p
      where p.session_id = s.id
        and p.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.sessions s
  where s.share_token = p_token
    and s.kind = 'match'
    and s.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_shared_match(uuid) from public;
grant execute on function public.get_shared_match(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

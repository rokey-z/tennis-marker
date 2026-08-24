-- Stable public match links. The UUID is the secret: only someone holding the link can read it.
alter table public.sessions add column if not exists share_token uuid;

create unique index if not exists sessions_share_token_idx
  on public.sessions (share_token)
  where share_token is not null;

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

comment on function public.get_shared_match(uuid) is
  'Returns the latest read-only match stats for an unguessable public share token.';

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isOutcome, isPlacementResult, type Outcome, type Point, type Session } from '../domain/types'
import type { Remote, RemoteError } from './syncEngine'

export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

/** null when the app runs in local-only mode (no env vars). */
export function createSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // we use hash routing and password sign-in; never parse the URL for auth tokens
      detectSessionInUrl: false,
      storageKey: 'tennis-marker.auth',
    },
  })
}

const PAGE = 1000

/** Columns added after 0001; dropped from the payload until the matching migration is applied. */
const OPTIONAL_SESSION_COLUMNS = ['opponent', 'venue', 'mode'] as const
const OPTIONAL_POINT_COLUMNS = ['outcome'] as const
const missingColumns = new Set<string>()

function stripMissing(row: Session | Point): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const c of missingColumns) delete out[c]
  return out
}

/** PostgREST reports an unknown column as PGRST204 (schema cache) or Postgres 42703. */
function missingColumnFrom(e: { message: string; code?: string }, columns: readonly string[]): string | null {
  if (e.code !== 'PGRST204' && e.code !== '42703' && !/column|schema cache/i.test(e.message)) return null
  return columns.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(e.message)) ?? null
}

/** Canonical ISO (…Z, ms precision) so string comparison of timestamps is meaningful. */
export function toIso(v: unknown): string {
  return new Date(String(v)).toISOString()
}

function normalizeSession(r: Record<string, unknown>): Session {
  return {
    id: String(r.id),
    user_id: r.user_id === null || r.user_id === undefined ? null : String(r.user_id),
    title: String(r.title ?? ''),
    opponent: String(r.opponent ?? ''),
    venue: String(r.venue ?? ''),
    date: String(r.date ?? '').slice(0, 10),
    kind: r.kind === 'match' ? 'match' : 'practice',
    mode: r.mode === 'placement' ? 'placement' : 'errors',
    notes: String(r.notes ?? ''),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
    deleted_at: r.deleted_at ? toIso(r.deleted_at) : null,
  }
}

/**
 * A row as the server has it → a Point. Every outcome the app writes must survive the round trip:
 * a placement that came back as an error would move the mark to the wrong half of the court.
 */
export function normalizePoint(r: Record<string, unknown>): Point {
  const outcome: Outcome = isOutcome(r.outcome) ? r.outcome : 'error'
  return {
    id: String(r.id),
    user_id: r.user_id === null || r.user_id === undefined ? null : String(r.user_id),
    session_id: String(r.session_id),
    x: Number(r.x),
    y: Number(r.y),
    // a winner is the opponent's shot: no stroke of hers, no error type, never forced
    stroke: outcome === 'winner' ? '' : r.stroke === 'serve' ? 'serve' : r.stroke === 'bh' ? 'bh' : 'fh',
    error_type: outcome === 'error' ? (r.error_type === 'net' ? 'net' : r.error_type === 'wide' ? 'wide' : 'long') : '',
    outcome,
    placement_result: outcome === 'placement' ? (isPlacementResult(r.placement_result) ? r.placement_result : 'unknown') : null,
    forced: outcome === 'error' && Boolean(r.forced),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
    deleted_at: r.deleted_at ? toIso(r.deleted_at) : null,
  }
}

function asRemoteError(e: { message: string; code?: string } | null, status?: number): RemoteError | null {
  return e ? { message: e.message, code: e.code, status } : null
}

/** Remote implementation over supabase-js. RLS scopes every query to the signed-in user. */
export function createSupabaseRemote(client: SupabaseClient): Remote {
  async function fetchTable<T>(table: 'sessions' | 'points', normalize: (r: Record<string, unknown>) => T) {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error, status } = await client
        .from(table)
        .select('*')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return { rows: null, error: asRemoteError(error, status) }
      for (const r of data ?? []) rows.push(normalize(r as Record<string, unknown>))
      if (!data || data.length < PAGE) break
    }
    return { rows, error: null }
  }

  return {
    async upsertSessions(rows) {
      // retry once per newly-discovered missing column so an un-migrated project still syncs everything else
      for (let attempt = 0; attempt <= OPTIONAL_SESSION_COLUMNS.length; attempt++) {
        const { error, status } = await client.from('sessions').upsert(rows.map(stripMissing), { onConflict: 'id' })
        if (!error) return { error: null }
        const missing = missingColumnFrom(error, OPTIONAL_SESSION_COLUMNS)
        if (!missing || missingColumns.has(missing)) return { error: asRemoteError(error, status) }
        missingColumns.add(missing)
        console.warn(`Supabase: sessions.${missing} column missing — run the matching supabase/migrations file`)
      }
      return { error: null }
    },
    async upsertPoints(rows) {
      for (let attempt = 0; attempt <= OPTIONAL_POINT_COLUMNS.length; attempt++) {
        const { error, status } = await client.from('points').upsert(rows.map(stripMissing), { onConflict: 'id' })
        if (!error) return { error: null }
        const missing = missingColumnFrom(error, OPTIONAL_POINT_COLUMNS)
        if (!missing || missingColumns.has(missing)) return { error: asRemoteError(error, status) }
        missingColumns.add(missing)
        console.warn(`Supabase: points.${missing} column missing — run supabase/migrations/0003_winners.sql`)
      }
      return { error: null }
    },
    async fetchAll() {
      const s = await fetchTable('sessions', normalizeSession)
      if (s.error || !s.rows) return { data: null, error: s.error }
      const p = await fetchTable('points', normalizePoint)
      if (p.error || !p.rows) return { data: null, error: p.error }
      return { data: { sessions: s.rows, points: p.rows }, error: null }
    },
  }
}

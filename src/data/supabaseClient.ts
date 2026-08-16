import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Point, Session } from '../domain/types'
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

/** Canonical ISO (…Z, ms precision) so string comparison of timestamps is meaningful. */
export function toIso(v: unknown): string {
  return new Date(String(v)).toISOString()
}

function normalizeSession(r: Record<string, unknown>): Session {
  return {
    id: String(r.id),
    user_id: r.user_id === null || r.user_id === undefined ? null : String(r.user_id),
    title: String(r.title ?? ''),
    date: String(r.date ?? '').slice(0, 10),
    kind: r.kind === 'match' ? 'match' : 'practice',
    notes: String(r.notes ?? ''),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
    deleted_at: r.deleted_at ? toIso(r.deleted_at) : null,
  }
}

function normalizePoint(r: Record<string, unknown>): Point {
  return {
    id: String(r.id),
    user_id: r.user_id === null || r.user_id === undefined ? null : String(r.user_id),
    session_id: String(r.session_id),
    x: Number(r.x),
    y: Number(r.y),
    stroke: r.stroke === 'bh' ? 'bh' : 'fh',
    error_type: r.error_type === 'net' ? 'net' : r.error_type === 'wide' ? 'wide' : 'long',
    forced: Boolean(r.forced),
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
      const { error, status } = await client.from('sessions').upsert(rows, { onConflict: 'id' })
      return { error: asRemoteError(error, status) }
    },
    async upsertPoints(rows) {
      const { error, status } = await client.from('points').upsert(rows, { onConflict: 'id' })
      return { error: asRemoteError(error, status) }
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

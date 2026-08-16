import type { Point, Session } from '../domain/types'
import { pendingCount, type Store } from './store'

export interface RemoteError {
  message: string
  status?: number
  code?: string
}

/** The tiny slice of a backend the engine needs; implemented for Supabase in supabaseClient.ts. */
export interface Remote {
  upsertSessions(rows: Session[]): Promise<{ error: RemoteError | null }>
  upsertPoints(rows: Point[]): Promise<{ error: RemoteError | null }>
  fetchAll(): Promise<{ data: { sessions: Session[]; points: Point[] } | null; error: RemoteError | null }>
}

export type SyncPhase = 'local' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  /** rows changed locally and not yet confirmed by the server */
  pending: number
  lastSyncAt: string | null
  error: string | null
}

export interface SyncEngineDeps {
  store: Store
  /** null → local-only mode */
  remote: Remote | null
  getUserId: () => string | null
  isOnline?: () => boolean
  now?: () => Date
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  debounceMs?: number
  backoffBaseMs?: number
  backoffMaxMs?: number
  /** minimum spacing between automatic pulls (visibility/focus) */
  minPullIntervalMs?: number
}

export interface SyncEngine {
  /** Upload dirty rows (sessions first, then points). Never throws. */
  flush(): Promise<void>
  /** Download everything for the user and merge. Never throws. */
  pull(force?: boolean): Promise<void>
  /** pull then flush */
  sync(force?: boolean): Promise<void>
  getStatus(): SyncStatus
  subscribe(listener: () => void): () => void
  /** Attach store + window listeners. Returns a stop function. */
  start(): () => void
  /** Call after sign-in/out. */
  onAuthChanged(): void
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const {
    store,
    remote,
    getUserId,
    isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    now = () => new Date(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    debounceMs = 300,
    backoffBaseMs = 5_000,
    backoffMaxMs = 300_000,
    minPullIntervalMs = 5_000,
  } = deps

  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let flushAgain = false
  let pulling: Promise<void> | null = null
  let lastError: string | null = null
  let lastSyncAt: string | null = null
  let lastPullMs = 0
  let failures = 0
  let retryTimer: unknown = null
  let debounceTimer: unknown = null
  let stopped = true

  // status snapshot is cached so useSyncExternalStore gets a stable object between changes
  let statusCache: SyncStatus | null = null
  function invalidate() {
    statusCache = null
    for (const l of listeners) l()
  }

  function computeStatus(): SyncStatus {
    const pending = pendingCount(store.getState())
    let phase: SyncPhase
    if (!remote) phase = 'local'
    else if (!getUserId()) phase = 'signed-out'
    else if (inFlight || pulling) phase = 'syncing'
    else if (!isOnline()) phase = 'offline'
    else if (lastError) phase = 'error'
    else phase = 'idle'
    return { phase, pending, lastSyncAt, error: lastError }
  }

  function scheduleRetry() {
    if (retryTimer !== null) return
    const delay = Math.min(backoffMaxMs, backoffBaseMs * 2 ** Math.min(failures, 10))
    retryTimer = setTimer(() => {
      retryTimer = null
      void engine.flush()
    }, delay)
  }

  function cancelRetry() {
    if (retryTimer !== null) {
      clearTimer(retryTimer)
      retryTimer = null
    }
  }

  function fail(err: RemoteError) {
    failures++
    lastError = describe(err)
    if (isOnline()) scheduleRetry()
  }

  async function doFlush(): Promise<void> {
    if (!remote) return
    do {
      flushAgain = false
      const uid = getUserId()
      if (!uid || !isOnline()) return
      const snap = store.getState()
      const sessions = snap.dirty.sessions.map((id) => snap.sessions[id]).filter((r): r is Session => !!r && r.user_id === uid)
      const points = snap.dirty.points.map((id) => snap.points[id]).filter((r): r is Point => !!r && r.user_id === uid)
      if (!sessions.length && !points.length) return

      if (sessions.length) {
        const { error } = await safe(() => remote.upsertSessions(sessions))
        if (error) return fail(error)
        store.clearDirty(
          'sessions',
          sessions.map((r) => [r.id, r.updated_at]),
        )
      }
      if (points.length) {
        const { error } = await safe(() => remote.upsertPoints(points))
        if (error) return fail(error)
        store.clearDirty(
          'points',
          points.map((r) => [r.id, r.updated_at]),
        )
      }
      failures = 0
      lastError = null
      lastSyncAt = now().toISOString()
      cancelRetry()
    } while (flushAgain)
  }

  const engine: SyncEngine = {
    flush() {
      if (!remote) return Promise.resolve()
      if (inFlight) {
        flushAgain = true
        return inFlight
      }
      inFlight = doFlush()
        .catch((e: unknown) => fail({ message: e instanceof Error ? e.message : String(e) }))
        .finally(() => {
          inFlight = null
          invalidate()
        })
      invalidate()
      return inFlight
    },

    pull(force = false) {
      if (!remote) return Promise.resolve()
      if (pulling) return pulling
      const uid = getUserId()
      if (!uid || !isOnline()) return Promise.resolve()
      const t = now().getTime()
      if (!force && t - lastPullMs < minPullIntervalMs) return Promise.resolve()
      lastPullMs = t
      pulling = (async () => {
        const { data, error } = await safe(() => remote.fetchAll())
        if (error || !data) {
          lastError = describe(error ?? { message: 'Empty response' })
          return
        }
        store.mergeRemote(data)
        lastError = null
        lastSyncAt = now().toISOString()
      })()
        .catch((e: unknown) => {
          lastError = e instanceof Error ? e.message : String(e)
        })
        .finally(() => {
          pulling = null
          invalidate()
        })
      invalidate()
      return pulling
    },

    async sync(force = false) {
      await engine.pull(force)
      await engine.flush()
    },

    getStatus() {
      if (!statusCache) statusCache = computeStatus()
      return statusCache
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    start() {
      stopped = false
      let lastPending = pendingCount(store.getState())
      const unsubStore = store.subscribe(() => {
        const p = pendingCount(store.getState())
        if (p > 0 && p !== lastPending) {
          if (debounceTimer !== null) clearTimer(debounceTimer)
          debounceTimer = setTimer(() => {
            debounceTimer = null
            void engine.flush()
          }, debounceMs)
        }
        lastPending = p
        invalidate()
      })
      const onOnline = () => {
        invalidate()
        void engine.sync(true)
      }
      const onOffline = () => invalidate()
      const onVisible = () => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        void engine.sync()
      }
      const w = typeof window !== 'undefined' ? window : null
      w?.addEventListener('online', onOnline)
      w?.addEventListener('offline', onOffline)
      w?.addEventListener('focus', onVisible)
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
      // initial sync
      void engine.sync(true)
      return () => {
        stopped = true
        unsubStore()
        w?.removeEventListener('online', onOnline)
        w?.removeEventListener('offline', onOffline)
        w?.removeEventListener('focus', onVisible)
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
        cancelRetry()
        if (debounceTimer !== null) {
          clearTimer(debounceTimer)
          debounceTimer = null
        }
      }
    },

    onAuthChanged() {
      lastError = null
      failures = 0
      cancelRetry()
      invalidate()
      if (!stopped) void engine.sync(true)
    },
  }
  return engine
}

async function safe<T extends { error: RemoteError | null }>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e: unknown) {
    return { error: { message: e instanceof Error ? e.message : String(e) } } as T
  }
}

function describe(err: RemoteError): string {
  if (err.status === 401 || err.status === 403 || err.code === 'PGRST301') return 'Not authorized — please sign in again'
  if (/fetch|network|Load failed/i.test(err.message)) return 'Network error — will retry'
  return err.message || 'Sync failed'
}

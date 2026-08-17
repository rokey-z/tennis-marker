import type { Point, Session } from '../domain/types'
import { pendingCount, type Store } from './store'
import { isUuid } from '../domain/validate'

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
  /** rows that can never be uploaded (an id the cloud cannot store) — they stay on this device */
  blocked: number
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
  /** ids dropped from the outbox because the server can never accept them (e.g. a non-uuid id) */
  const blockedIds = new Set<string>()
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
    return { phase, pending, blocked: blockedIds.size, lastSyncAt, error: lastError }
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
      const syncable = <T extends { id: string; user_id: string | null }>(r: T | undefined): r is T => !!r && r.user_id === uid && isUuid(r.id)
      const sessions = snap.dirty.sessions.map((id) => snap.sessions[id]).filter(syncable)
      const points = snap.dirty.points.map((id) => snap.points[id]).filter(syncable)

      // rows with an id the server cannot store would fail forever and hold up everything behind
      // them — drop them from the outbox once, keep them on the device, and report the count
      const stuckSessions = snap.dirty.sessions.filter((id) => snap.sessions[id] && !isUuid(id))
      const stuckPoints = snap.dirty.points.filter((id) => snap.points[id] && !isUuid(id))
      if (stuckSessions.length || stuckPoints.length) {
        for (const id of [...stuckSessions, ...stuckPoints]) blockedIds.add(id)
        if (stuckSessions.length) store.clearDirty('sessions', stuckSessions.map((id) => [id, snap.sessions[id].updated_at] as [string, string]))
        if (stuckPoints.length) store.clearDirty('points', stuckPoints.map((id) => [id, snap.points[id].updated_at] as [string, string]))
        console.warn(`Sync: ${stuckSessions.length + stuckPoints.length} local row(s) have an id the cloud cannot store and will stay on this device`)
      }

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

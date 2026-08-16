import { useSyncExternalStore } from 'react'
import { roundFeet } from '../domain/court'
import { compareSessionDesc } from '../domain/stats'
import { KIND_LABEL, type NewPoint, type Point, type Session, type SessionKind } from '../domain/types'
import { todayLocalISO } from '../lib/format'
import { sanitizePoint, sanitizeSession } from '../domain/validate'
import {
  adoptOwnerless,
  clearDirty,
  copyForeignToOwner,
  dropRows,
  emptyState,
  foreignRowIds,
  loadState,
  markDirty,
  mergeRemote,
  saveState,
  type RepoState,
  type StorageLike,
  type Table,
} from './localRepo'

export interface StoreDeps {
  now?: () => Date
  newId?: () => string
}

export interface Store {
  getState(): RepoState
  subscribe(listener: () => void): () => void
  /** Re-read from storage (another tab wrote). */
  reload(): void
  createSession(input?: Partial<Pick<Session, 'title' | 'date' | 'kind' | 'notes'>>): Session
  updateSession(id: string, patch: Partial<Pick<Session, 'title' | 'date' | 'kind' | 'notes'>>): void
  /** Soft-deletes the session and all its live points. */
  deleteSession(id: string): void
  addPoint(input: NewPoint): Point
  deletePoint(id: string): void
  /** Soft-deletes the most recent live point of the session; returns it or null. */
  undoLastPoint(sessionId: string): Point | null
  clearDirty(table: Table, snapshot: Array<[string, string]>): void
  mergeRemote(remote: { sessions: Session[]; points: Point[] }): number
  /** Backup import: adds rows that don't exist yet under the current owner, queued for upload. Returns count added. */
  importRows(sessions: Session[], points: Point[]): number
  /** Sets the owner for new rows; adopts ownerless rows. Returns counts for the UI. */
  setOwner(uid: string | null): { adopted: number; foreign: number }
  foreignCount(): number
  copyForeignToOwner(): number
  dropForeign(): void
  /** Wipe everything on this device. */
  clearAll(): void
}

export function defaultId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // RFC 4122 v4 fallback
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export { todayLocalISO }

export function defaultSessionTitle(kind: SessionKind, date: string): string {
  return `${KIND_LABEL[kind]} ${date}`
}

export function createStore(storage: StorageLike, deps: StoreDeps = {}): Store {
  const now = deps.now ?? (() => new Date())
  const newId = deps.newId ?? defaultId
  let state = loadState(storage)
  const listeners = new Set<() => void>()

  function set(next: RepoState) {
    if (next === state) return
    state = next
    try {
      saveState(storage, state)
    } catch (err) {
      console.error('Failed to persist state', err)
    }
    for (const l of listeners) l()
  }

  const iso = () => now().toISOString()

  const store: Store = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reload() {
      const next = loadState(storage)
      state = next
      for (const l of listeners) l()
    },
    createSession(input = {}) {
      const t = iso()
      const date = input.date ?? todayLocalISO(now())
      const kind = input.kind ?? 'practice'
      const s: Session = {
        id: newId(),
        user_id: state.meta.ownerId,
        title: input.title?.trim() || defaultSessionTitle(kind, date),
        date,
        kind,
        notes: input.notes ?? '',
        created_at: t,
        updated_at: t,
        deleted_at: null,
      }
      set(markDirty({ ...state, sessions: { ...state.sessions, [s.id]: s } }, 'sessions', [s.id]))
      return s
    },
    updateSession(id, patch) {
      const s = state.sessions[id]
      if (!s) return
      const next: Session = { ...s, ...patch, updated_at: iso() }
      set(markDirty({ ...state, sessions: { ...state.sessions, [id]: next } }, 'sessions', [id]))
    },
    deleteSession(id) {
      const s = state.sessions[id]
      if (!s) return
      const t = iso()
      const points = { ...state.points }
      const dirtyP: string[] = []
      for (const p of Object.values(points)) {
        if (p.session_id === id && !p.deleted_at) {
          points[p.id] = { ...p, deleted_at: t, updated_at: t }
          dirtyP.push(p.id)
        }
      }
      let next: RepoState = {
        ...state,
        sessions: { ...state.sessions, [id]: { ...s, deleted_at: t, updated_at: t } },
        points,
      }
      next = markDirty(next, 'sessions', [id])
      next = markDirty(next, 'points', dirtyP)
      set(next)
    },
    addPoint(input) {
      const t = iso()
      const p: Point = {
        id: newId(),
        user_id: state.meta.ownerId,
        session_id: input.session_id,
        x: roundFeet(input.x),
        y: roundFeet(input.y),
        stroke: input.stroke,
        error_type: input.error_type,
        forced: !!input.forced,
        created_at: t,
        updated_at: t,
        deleted_at: null,
      }
      set(markDirty({ ...state, points: { ...state.points, [p.id]: p } }, 'points', [p.id]))
      return p
    },
    deletePoint(id) {
      const p = state.points[id]
      if (!p || p.deleted_at) return
      const t = iso()
      set(markDirty({ ...state, points: { ...state.points, [id]: { ...p, deleted_at: t, updated_at: t } } }, 'points', [id]))
    },
    undoLastPoint(sessionId) {
      const last = livePointsForSession(state, sessionId).at(-1) ?? null
      if (last) store.deletePoint(last.id)
      return last
    },
    clearDirty(table, snapshot) {
      set(clearDirty(state, table, snapshot))
    },
    mergeRemote(remote) {
      const r = mergeRemote(state, remote, iso())
      set(r.state)
      return r.changed
    },
    importRows(sessions, points) {
      const owner = state.meta.ownerId
      const t = iso()
      const nextSessions = { ...state.sessions }
      const nextPoints = { ...state.points }
      const ds: string[] = []
      const dp: string[] = []
      for (const raw of sessions) {
        const s = sanitizeSession(raw)
        if (!s || nextSessions[s.id]) continue
        nextSessions[s.id] = { ...s, user_id: owner, updated_at: t, deleted_at: null }
        ds.push(s.id)
      }
      for (const raw of points) {
        const p = sanitizePoint(raw)
        if (!p || nextPoints[p.id] || !nextSessions[p.session_id]) continue
        nextPoints[p.id] = { ...p, user_id: owner, updated_at: t, deleted_at: null }
        dp.push(p.id)
      }
      if (!ds.length && !dp.length) return 0
      let next: RepoState = { ...state, sessions: nextSessions, points: nextPoints }
      next = markDirty(next, 'sessions', ds)
      next = markDirty(next, 'points', dp)
      set(next)
      return ds.length + dp.length
    },
    setOwner(uid) {
      let next: RepoState = state.meta.ownerId === uid ? state : { ...state, meta: { ...state.meta, ownerId: uid } }
      let adopted = 0
      if (uid) {
        const a = adoptOwnerless(next, uid)
        next = a.state
        adopted = a.adopted
      }
      set(next)
      const f = foreignRowIds(state, uid)
      return { adopted, foreign: f.sessions.length + f.points.length }
    },
    foreignCount() {
      const f = foreignRowIds(state, state.meta.ownerId)
      return f.sessions.length + f.points.length
    },
    copyForeignToOwner() {
      const uid = state.meta.ownerId
      if (!uid) return 0
      const r = copyForeignToOwner(state, uid, newId, iso())
      set(r.state)
      return r.copied
    },
    dropForeign() {
      set(dropRows(state, foreignRowIds(state, state.meta.ownerId)))
    },
    clearAll() {
      set({ ...emptyState(), meta: { ownerId: state.meta.ownerId, lastPullAt: null } })
    },
  }
  return store
}

// ---------- selectors (pure) ----------

export function liveSessions(state: RepoState): Session[] {
  return Object.values(state.sessions)
    .filter((s) => !s.deleted_at)
    .sort(compareSessionDesc)
}

export function livePointsForSession(state: RepoState, sessionId: string): Point[] {
  return Object.values(state.points)
    .filter((p) => p.session_id === sessionId && !p.deleted_at)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
}

export function allLivePoints(state: RepoState): Point[] {
  const liveSess = new Set(Object.values(state.sessions).filter((s) => !s.deleted_at).map((s) => s.id))
  return Object.values(state.points).filter((p) => !p.deleted_at && liveSess.has(p.session_id))
}

export function pendingCount(state: RepoState): number {
  return state.dirty.sessions.length + state.dirty.points.length
}

// ---------- React binding ----------

export function useStoreState(store: Store): RepoState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}

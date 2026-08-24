import { useSyncExternalStore } from 'react'
import { roundFeet } from '../domain/court'
import { compareSessionDesc } from '../domain/stats'
import { isPlacementStroke, isShotType, isWinnerServeType, type NewPoint, type Point, type Session } from '../domain/types'
import { cleanOpponent, cleanUtr, opponentFromLegacyTitle, opponentKey } from '../domain/session'
import { todayLocalISO } from '../lib/format'
import { isUuid, sanitizePoint, sanitizeSession } from '../domain/validate'
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
  createSession(input?: Partial<Pick<Session, 'opponent' | 'venue' | 'date' | 'kind' | 'mode' | 'notes'>>): Session
  updateSession(id: string, patch: Partial<Pick<Session, 'opponent' | 'opponent_utr' | 'venue' | 'date' | 'kind' | 'mode' | 'notes' | 'finished_at' | 'self_rating' | 'share_token'>>): void
  /** Add an opponent before she has played them (device-local until used in a session). Returns false if blank/duplicate. */
  addRosterOpponent(name: string): boolean
  /** Rename an opponent across every session that uses it (case-insensitive match). Returns sessions changed. */
  renameOpponent(from: string, to: string): number
  /** Clear an opponent from its sessions (the sessions themselves are kept). Returns sessions changed. */
  clearOpponent(name: string): number
  /** Soft-deletes the session and all its live points. */
  deleteSession(id: string): void
  /** Brings a deleted session back, with the points that went down with it. Returns points restored. */
  restoreSession(id: string): number
  /** Sessions deleted at some point, newest deletion first — the source for an "undo that" list. */
  deletedSessions(): Session[]
  addPoint(input: NewPoint): Point
  /** Correct a logged point (wrong stroke, wrong error, forced) without moving it. */
  updatePoint(id: string, patch: Partial<Pick<Point, 'stroke' | 'error_type' | 'forced' | 'outcome' | 'shot_type'>>): void
  deletePoint(id: string): void
  /** Bring back a soft-deleted point (undo of a delete). */
  restorePoint(id: string): void
  /** Soft-deletes the most recent live point of the session; returns it or null. */
  /** Removes the newest live point of the session; `only` narrows it to the marks in view. */
  undoLastPoint(sessionId: string, only?: (p: Point) => boolean): Point | null
  clearDirty(table: Table, snapshot: Array<[string, string]>): void
  mergeRemote(remote: { sessions: Session[]; points: Point[] }): number
  /** Backup import: adds rows that don't exist yet under the current owner, queued for upload. Returns count added. */
  importRows(sessions: Session[], points: Point[]): number
  /** Sets the owner for new rows; adopts ownerless rows. Returns counts for the UI. */
  setOwner(uid: string | null): { adopted: number; foreign: number }
  foreignCount(): number
  copyForeignToOwner(): number
  dropForeign(): void
  /** Whose errors these are — used for the court label. Device-local. */
  setPlayerName(name: string): void
  /** Rows with an id the cloud cannot store (hand-seeded or imported junk). */
  unsyncableCount(): number
  /** Delete those rows outright — they only exist on this device. Returns how many went. */
  dropUnsyncable(): number
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

  function setRoster(fn: (roster: string[]) => string[]): void {
    const next = fn(state.meta.roster)
    if (next.length === state.meta.roster.length && next.every((v, i) => v === state.meta.roster[i])) return
    set({ ...state, meta: { ...state.meta, roster: next } })
  }

  function bulkSetOpponent(key: string, opponent: string): number {
    const t = iso()
    const sessions = { ...state.sessions }
    const ids: string[] = []
    for (const s of Object.values(sessions)) {
      if (s.deleted_at || opponentKey(s.opponent ?? '') !== key) continue
      sessions[s.id] = { ...s, opponent, updated_at: t }
      ids.push(s.id)
    }
    if (!ids.length) return 0
    set(markDirty({ ...state, sessions }, 'sessions', ids))
    return ids.length
  }

  /**
   * One-time upgrade for rows written before opponents existed: a title like "vs Emma — league"
   * becomes opponent "Emma" (the title is kept, and titles that don't name an opponent are untouched).
   */
  function migrateLegacyTitles(input: RepoState): RepoState {
    const sessions = { ...input.sessions }
    const ids: string[] = []
    for (const s of Object.values(sessions)) {
      if (s.opponent) continue
      const opponent = opponentFromLegacyTitle(s.title ?? '')
      if (!opponent) continue
      sessions[s.id] = { ...s, opponent, updated_at: iso() }
      ids.push(s.id)
    }
    if (!ids.length) return input
    return markDirty({ ...input, sessions }, 'sessions', ids)
  }

  const migrated = migrateLegacyTitles(state)
  if (migrated !== state) {
    state = migrated
    try {
      saveState(storage, state)
    } catch {
      /* best effort */
    }
  }

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
        title: '',
        opponent: cleanOpponent(input.opponent ?? ''),
        venue: cleanOpponent(input.venue ?? ''),
        date,
        kind,
        mode: input.mode ?? 'errors',
        notes: input.notes ?? '',
        finished_at: null,
        self_rating: null,
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
      if (patch.opponent !== undefined) next.opponent = cleanOpponent(patch.opponent)
      if (patch.opponent_utr !== undefined) next.opponent_utr = cleanUtr(patch.opponent_utr)
      if (patch.venue !== undefined) next.venue = cleanOpponent(patch.venue)
      set(markDirty({ ...state, sessions: { ...state.sessions, [id]: next } }, 'sessions', [id]))
    },
    addRosterOpponent(name) {
      const clean = cleanOpponent(name)
      if (!clean) return false
      const key = opponentKey(clean)
      const known = new Set([...state.meta.roster.map(opponentKey), ...Object.values(state.sessions).filter((s) => !s.deleted_at).map((s) => opponentKey(s.opponent))])
      if (known.has(key)) return false
      set({ ...state, meta: { ...state.meta, roster: [...state.meta.roster, clean] } })
      return true
    },
    renameOpponent(from, to) {
      const key = opponentKey(from)
      const name = cleanOpponent(to)
      if (!key || !name) return 0
      const changed = bulkSetOpponent(key, name)
      setRoster((r) => {
        const others = r.filter((x) => opponentKey(x) !== key)
        // keep it in the roster only while it is still unused by any session
        return others.some((x) => opponentKey(x) === opponentKey(name)) || changed > 0 ? others : [...others, name]
      })
      return changed
    },
    clearOpponent(name) {
      const key = opponentKey(name)
      if (!key) return 0
      const changed = bulkSetOpponent(key, '')
      setRoster((r) => r.filter((x) => opponentKey(x) !== key))
      return changed
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
    restoreSession(id) {
      const s = state.sessions[id]
      if (!s || !s.deleted_at) return 0
      const deletedWith = s.deleted_at
      const t = iso()
      const points = { ...state.points }
      const dirtyP: string[] = []
      for (const p of Object.values(points)) {
        // only the points that went down with the session — ones deleted by hand before it stay deleted
        if (p.session_id === id && p.deleted_at === deletedWith) {
          points[p.id] = { ...p, deleted_at: null, updated_at: t }
          dirtyP.push(p.id)
        }
      }
      let next: RepoState = {
        ...state,
        sessions: { ...state.sessions, [id]: { ...s, deleted_at: null, updated_at: t } },
        points,
      }
      next = markDirty(next, 'sessions', [id])
      next = markDirty(next, 'points', dirtyP)
      set(next)
      return dirtyP.length
    },
    deletedSessions() {
      return Object.values(state.sessions)
        .filter((s) => s.deleted_at)
        .sort((a, b) => (a.deleted_at! < b.deleted_at! ? 1 : a.deleted_at! > b.deleted_at! ? -1 : 0))
    },
    addPoint(input) {
      const t = iso()
      const p: Point = {
        id: newId(),
        user_id: state.meta.ownerId,
        session_id: input.session_id,
        x: roundFeet(input.x),
        y: roundFeet(input.y),
        stroke: input.outcome === 'winner' ? '' : input.stroke,
        error_type: input.outcome === 'error' || input.outcome === undefined ? input.error_type : '',
        outcome: input.outcome ?? 'error',
        placement_result: input.outcome === 'placement' ? (input.placement_result ?? 'unknown') : null,
        shot_type:
          (input.outcome ?? 'error') === 'error' && isShotType(input.shot_type)
            ? input.shot_type
            : input.outcome === 'player_winner' && (input.stroke === 'serve' ? isWinnerServeType(input.shot_type) : isShotType(input.shot_type))
              ? input.shot_type
              : null,
        forced: (input.outcome ?? 'error') === 'error' && !!input.forced,
        created_at: t,
        updated_at: t,
        deleted_at: null,
      }
      set(markDirty({ ...state, points: { ...state.points, [p.id]: p } }, 'points', [p.id]))
      return p
    },
    updatePoint(id, patch) {
      const p = state.points[id]
      if (!p || p.deleted_at) return
      const next: Point = { ...p, ...patch, updated_at: iso() }
      if (next.outcome === 'winner') {
        next.stroke = ''
        next.error_type = ''
        next.forced = false
        next.shot_type = null
      } else if (next.outcome === 'player_winner') {
        if (!isPlacementStroke(next.stroke)) next.stroke = 'fh'
        next.error_type = ''
        next.forced = false
        if (!(next.stroke === 'serve' ? isWinnerServeType(next.shot_type) : isShotType(next.shot_type))) next.shot_type = null
      } else if (next.outcome !== 'error' || !isShotType(next.shot_type)) {
        next.shot_type = null
      }
      set(markDirty({ ...state, points: { ...state.points, [id]: next } }, 'points', [id]))
    },
    deletePoint(id) {
      const p = state.points[id]
      if (!p || p.deleted_at) return
      const t = iso()
      set(markDirty({ ...state, points: { ...state.points, [id]: { ...p, deleted_at: t, updated_at: t } } }, 'points', [id]))
    },
    restorePoint(id) {
      const p = state.points[id]
      if (!p || !p.deleted_at) return
      const t = iso()
      set(markDirty({ ...state, points: { ...state.points, [id]: { ...p, deleted_at: null, updated_at: t } } }, 'points', [id]))
    },
    undoLastPoint(sessionId, only) {
      const list = livePointsForSession(state, sessionId)
      let last: Point | null = null
      for (let i = list.length - 1; i >= 0; i--) {
        if (!only || only(list[i])) {
          last = list[i]
          break
        }
      }
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
    setPlayerName(name) {
      const clean = cleanOpponent(name)
      if (clean === state.meta.playerName) return
      set({ ...state, meta: { ...state.meta, playerName: clean } })
    },
    unsyncableCount() {
      return unsyncableIds(state).sessions.length + unsyncableIds(state).points.length
    },
    dropUnsyncable() {
      const ids = unsyncableIds(state)
      const n = ids.sessions.length + ids.points.length
      if (!n) return 0
      // their points go too, or they would linger with no session
      const orphaned = Object.values(state.points).filter((p) => ids.sessions.includes(p.session_id)).map((p) => p.id)
      set(dropRows(state, { sessions: ids.sessions, points: [...new Set([...ids.points, ...orphaned])] }))
      return n
    },
    clearAll() {
      set({ ...emptyState(), meta: { ...state.meta, lastPullAt: null } })
    },
  }
  return store
}

/** Ids that can never reach the cloud, because the server stores ids as uuid. */
export function unsyncableIds(state: RepoState): { sessions: string[]; points: string[] } {
  return {
    sessions: Object.keys(state.sessions).filter((id) => !isUuid(id)),
    points: Object.keys(state.points).filter((id) => !isUuid(id)),
  }
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

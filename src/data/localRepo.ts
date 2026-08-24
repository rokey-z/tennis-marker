import { isPointShotType, type Point, type Session } from '../domain/types'

/** Minimal Storage interface so the repo is testable without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type Table = 'sessions' | 'points'

export interface RepoState {
  sessions: Record<string, Session>
  points: Record<string, Point>
  /** ids with local changes not yet confirmed by the server */
  dirty: { sessions: string[]; points: string[] }
  meta: {
    /** user id rows are created for; null in local-only mode / signed out */
    ownerId: string | null
    lastPullAt: string | null
    /** opponents added by hand before they appear in any session (this device only) */
    roster: string[]
    /** whose errors these are, for the court label — '' falls back to "Her" */
    playerName: string
  }
}

export const STORAGE_KEY = 'tennis-marker.v1'

export function emptyState(): RepoState {
  return {
    sessions: {},
    points: {},
    dirty: { sessions: [], points: [] },
    meta: { ownerId: null, lastPullAt: null, roster: [], playerName: '' },
  }
}

export function memoryStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  }
}

/** Tolerant load: any parse/shape problem yields an empty state rather than a crash. */
export function loadState(storage: StorageLike): RepoState {
  const base = emptyState()
  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return base
  }
  if (!raw) return base
  try {
    const parsed = JSON.parse(raw) as Partial<RepoState>
    return {
      sessions: isRecord(parsed.sessions) ? upgradeSessions(parsed.sessions as Record<string, Session>) : {},
      points: isRecord(parsed.points) ? upgradePoints(parsed.points as Record<string, Point>) : {},
      dirty: {
        sessions: Array.isArray(parsed.dirty?.sessions) ? uniq(parsed.dirty!.sessions) : [],
        points: Array.isArray(parsed.dirty?.points) ? uniq(parsed.dirty!.points) : [],
      },
      meta: {
        ownerId: typeof parsed.meta?.ownerId === 'string' ? parsed.meta.ownerId : null,
        lastPullAt: typeof parsed.meta?.lastPullAt === 'string' ? parsed.meta.lastPullAt : null,
        roster: Array.isArray(parsed.meta?.roster) ? uniq(parsed.meta!.roster) : [],
        playerName: typeof parsed.meta?.playerName === 'string' ? parsed.meta.playerName : '',
      },
    }
  } catch {
    return base
  }
}

export function saveState(storage: StorageLike, state: RepoState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/**
 * Fields added in later versions are missing from rows written by older ones. Default them here,
 * at the single point where stored data enters the app, so no screen has to guard for `undefined`.
 */
function upgradeSessions(sessions: Record<string, Session>): Record<string, Session> {
  let out = sessions
  for (const [id, s] of Object.entries(sessions)) {
    if (typeof s?.opponent === 'string' && typeof s?.venue === 'string' && typeof s?.mode === 'string' && 'finished_at' in s && 'self_rating' in s && (!('share_token' in s) || s.share_token === null || typeof s.share_token === 'string')) continue
    if (out === sessions) out = { ...sessions }
    out[id] = {
      ...s,
      opponent: typeof s?.opponent === 'string' ? s.opponent : '',
      venue: typeof s?.venue === 'string' ? s.venue : '',
      mode: s?.mode === 'placement' ? 'placement' : 'errors',
      finished_at: typeof s?.finished_at === 'string' ? s.finished_at : null,
      self_rating: Number.isInteger(s?.self_rating) && Number(s.self_rating) >= 1 && Number(s.self_rating) <= 100 ? Number(s.self_rating) : null,
      share_token: typeof s?.share_token === 'string' ? s.share_token : null,
    }
  }
  return out
}

function upgradePoints(points: Record<string, Point>): Record<string, Point> {
  let out = points
  for (const [id, p] of Object.entries(points)) {
    // rows from before winners existed are errors; winners recorded before they became the
    // opponent's shot still carry one of her strokes — drop it, there is nothing to attribute
    const needsOutcome = typeof p?.outcome !== 'string'
    const staleStroke = p?.outcome === 'winner' && p.stroke !== ''
    const legacyNet = p?.outcome === 'placement' && p.placement_result === 'net'
    const needsShotType = !('shot_type' in p) || p.shot_type !== null && !isPointShotType(p.shot_type)
    if (!needsOutcome && !staleStroke && !legacyNet && !needsShotType) continue
    if (out === points) out = { ...points }
    out[id] = {
      ...p,
      outcome: legacyNet || needsOutcome ? 'error' : p.outcome,
      stroke: staleStroke ? '' : p.stroke,
      error_type: legacyNet ? 'net' : p.error_type,
      placement_result: legacyNet ? null : p.placement_result,
      shot_type: isPointShotType(p.shot_type) ? p.shot_type : null,
    }
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids.filter((x) => typeof x === 'string'))]
}

export function markDirty(state: RepoState, table: Table, ids: string[]): RepoState {
  const cur = state.dirty[table]
  const add = ids.filter((id) => !cur.includes(id))
  if (!add.length) return state
  return { ...state, dirty: { ...state.dirty, [table]: [...cur, ...add] } }
}

/**
 * Remove ids from the dirty set only if the row's updated_at still equals the snapshot value,
 * so an edit made while an upload was in flight is not lost.
 */
export function clearDirty(state: RepoState, table: Table, snapshot: Array<[id: string, updatedAt: string]>): RepoState {
  const rows = state[table] as Record<string, { updated_at: string }>
  const drop = new Set(snapshot.filter(([id, u]) => rows[id]?.updated_at === u).map(([id]) => id))
  if (!drop.size) return state
  return { ...state, dirty: { ...state.dirty, [table]: state.dirty[table].filter((id) => !drop.has(id)) } }
}

type Row = { id: string; updated_at: string; deleted_at: string | null }

/**
 * Which version of a row to keep: last write wins, with the tombstone winning a tie.
 *
 * A delete used to win outright, whatever the timestamps — which quietly broke Undo: restoring a
 * row that had already been uploaded looked fine until the next pull put the tombstone back. A
 * restore is a later write than the delete it undoes, so it now wins like any other later write.
 * Returns null if the local row should stay.
 */
export function pickRemote<T extends Row>(local: T | undefined, remote: T): T | null {
  if (!local) return remote
  if (remote.updated_at === local.updated_at) return remote.deleted_at && !local.deleted_at ? remote : null
  return remote.updated_at > local.updated_at ? remote : null
}

export function mergeRemote(
  state: RepoState,
  remote: { sessions: Session[]; points: Point[] },
  pulledAt: string,
): { state: RepoState; changed: number } {
  let changed = 0
  let sessions = state.sessions
  let points = state.points
  for (const r of remote.sessions) {
    const pick = pickRemote(sessions[r.id], r)
    if (pick) {
      if (sessions === state.sessions) sessions = { ...sessions }
      sessions[r.id] = pick
      changed++
    }
  }
  for (const r of remote.points) {
    const pick = pickRemote(points[r.id], r)
    if (pick) {
      if (points === state.points) points = { ...points }
      points[r.id] = pick
      changed++
    }
  }
  return { state: { ...state, sessions, points, meta: { ...state.meta, lastPullAt: pulledAt } }, changed }
}

/** Rows without an owner become the given user's and are queued for upload. */
export function adoptOwnerless(state: RepoState, uid: string): { state: RepoState; adopted: number } {
  let adopted = 0
  const sessions = { ...state.sessions }
  const points = { ...state.points }
  const dirtyS: string[] = []
  const dirtyP: string[] = []
  for (const s of Object.values(sessions)) {
    if (s.user_id === null) {
      sessions[s.id] = { ...s, user_id: uid }
      dirtyS.push(s.id)
      adopted++
    }
  }
  for (const p of Object.values(points)) {
    if (p.user_id === null) {
      points[p.id] = { ...p, user_id: uid }
      dirtyP.push(p.id)
      adopted++
    }
  }
  if (!adopted) return { state, adopted }
  let next: RepoState = { ...state, sessions, points }
  next = markDirty(next, 'sessions', dirtyS)
  next = markDirty(next, 'points', dirtyP)
  return { state: next, adopted }
}

/**
 * Rows that belong to some other account (left over from a previous sign-in on this device).
 * While signed out (uid null) nothing is foreign — the device keeps showing its data.
 */
export function foreignRowIds(state: RepoState, uid: string | null): { sessions: string[]; points: string[] } {
  if (!uid) return { sessions: [], points: [] }
  const sessions = Object.values(state.sessions)
    .filter((s) => s.user_id !== null && s.user_id !== uid)
    .map((s) => s.id)
  const points = Object.values(state.points)
    .filter((p) => p.user_id !== null && p.user_id !== uid)
    .map((p) => p.id)
  return { sessions, points }
}

export function dropRows(state: RepoState, ids: { sessions: string[]; points: string[] }): RepoState {
  const sessions = { ...state.sessions }
  const points = { ...state.points }
  const ds = new Set(ids.sessions)
  const dp = new Set(ids.points)
  for (const id of ds) delete sessions[id]
  for (const id of dp) delete points[id]
  return {
    ...state,
    sessions,
    points,
    dirty: {
      sessions: state.dirty.sessions.filter((id) => !ds.has(id)),
      points: state.dirty.points.filter((id) => !dp.has(id)),
    },
  }
}

/**
 * Re-home foreign rows to the current user under NEW ids (the old ids belong to another
 * account on the server and could not be updated through RLS).
 */
export function copyForeignToOwner(
  state: RepoState,
  uid: string,
  newId: () => string,
  now: string,
): { state: RepoState; copied: number } {
  const ids = foreignRowIds(state, uid)
  if (!ids.sessions.length && !ids.points.length) return { state, copied: 0 }
  const sessionMap = new Map<string, string>()
  const sessions = { ...state.sessions }
  const points = { ...state.points }
  const dirtyS: string[] = []
  const dirtyP: string[] = []
  for (const oldId of ids.sessions) {
    const s = sessions[oldId]
    const id = newId()
    sessionMap.set(oldId, id)
    sessions[id] = { ...s, id, user_id: uid, updated_at: now }
    delete sessions[oldId]
    dirtyS.push(id)
  }
  for (const oldId of ids.points) {
    const p = points[oldId]
    const id = newId()
    const session_id = sessionMap.get(p.session_id) ?? p.session_id
    points[id] = { ...p, id, session_id, user_id: uid, updated_at: now }
    delete points[oldId]
    dirtyP.push(id)
  }
  const oldS = new Set(ids.sessions)
  const oldP = new Set(ids.points)
  let next: RepoState = {
    ...state,
    sessions,
    points,
    dirty: {
      sessions: state.dirty.sessions.filter((id) => !oldS.has(id)),
      points: state.dirty.points.filter((id) => !oldP.has(id)),
    },
  }
  next = markDirty(next, 'sessions', dirtyS)
  next = markDirty(next, 'points', dirtyP)
  return { state: next, copied: dirtyS.length + dirtyP.length }
}

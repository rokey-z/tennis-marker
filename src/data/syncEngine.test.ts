import { describe, expect, it } from 'vitest'
import type { Point, Session } from '../domain/types'
import { memoryStorage } from './localRepo'
import { createStore, liveSessions, pendingCount } from './store'
import { createSyncEngine, type Remote, type RemoteError } from './syncEngine'

/** In-memory backend that records calls and can be told to fail. */
function fakeRemote() {
  const db = { sessions: new Map<string, Session>(), points: new Map<string, Point>() }
  const calls: string[] = []
  const state = {
    failSessions: null as RemoteError | null,
    failPoints: null as RemoteError | null,
    failFetch: null as RemoteError | null,
    /** resolves the next upsertPoints only when released (to simulate in-flight edits) */
    holdPoints: null as null | { release: () => void; promise: Promise<void> },
  }
  const remote: Remote = {
    async upsertSessions(rows) {
      calls.push(`sessions:${rows.length}`)
      if (state.failSessions) return { error: state.failSessions }
      for (const r of rows) db.sessions.set(r.id, r)
      return { error: null }
    },
    async upsertPoints(rows) {
      calls.push(`points:${rows.length}`)
      if (state.holdPoints) await state.holdPoints.promise
      if (state.failPoints) return { error: state.failPoints }
      for (const r of rows) db.points.set(r.id, r)
      return { error: null }
    },
    async fetchAll() {
      calls.push('fetch')
      if (state.failFetch) return { data: null, error: state.failFetch }
      return { data: { sessions: [...db.sessions.values()], points: [...db.points.values()] }, error: null }
    },
  }
  return { remote, db, calls, state }
}

function hold() {
  let release!: () => void
  const promise = new Promise<void>((res) => (release = res))
  return { release, promise }
}

function setup(opts: { uid?: string | null; online?: boolean } = {}) {
  let t = Date.UTC(2026, 7, 15, 10, 0, 0)
  const now = () => new Date((t += 1000))
  let n = 0
  const store = createStore(memoryStorage(), { now, newId: () => `id${++n}` })
  const fr = fakeRemote()
  const timers: Array<{ fn: () => void; ms: number }> = []
  const ctx = { uid: opts.uid === undefined ? 'u1' : opts.uid, online: opts.online ?? true }
  const engine = createSyncEngine({
    store,
    remote: fr.remote,
    getUserId: () => ctx.uid,
    isOnline: () => ctx.online,
    now,
    setTimer: (fn, ms) => {
      const h = { fn, ms }
      timers.push(h)
      return h
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as { fn: () => void; ms: number })
      if (i >= 0) timers.splice(i, 1)
    },
  })
  if (ctx.uid) store.setOwner(ctx.uid)
  return { store, engine, fr, timers, ctx, now }
}

const mkPoint = (session_id: string) => ({ session_id, x: 1, y: 40, stroke: 'fh' as const, error_type: 'long' as const, forced: false })

describe('flush', () => {
  it('uploads sessions before points and clears dirty flags', async () => {
    const { store, engine, fr } = setup()
    const s = store.createSession()
    store.addPoint(mkPoint(s.id))
    store.addPoint(mkPoint(s.id))
    await engine.flush()
    expect(fr.calls).toEqual(['sessions:1', 'points:2'])
    expect(pendingCount(store.getState())).toBe(0)
    expect(fr.db.points.size).toBe(2)
    expect(engine.getStatus()).toMatchObject({ phase: 'idle', pending: 0, error: null })
    expect(engine.getStatus().lastSyncAt).toBeTruthy()
  })

  it('keeps points queued when the session upload fails, and schedules a retry with backoff', async () => {
    const { store, engine, fr, timers } = setup()
    const s = store.createSession()
    store.addPoint(mkPoint(s.id))
    fr.state.failSessions = { message: 'boom', status: 500 }
    await engine.flush()
    expect(fr.calls).toEqual(['sessions:1'])
    expect(pendingCount(store.getState())).toBe(2)
    expect(engine.getStatus()).toMatchObject({ phase: 'error', pending: 2, error: 'boom' })
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(10_000) // base 5s * 2^1 after first failure
    // recover: fire the retry
    fr.state.failSessions = null
    const retry = timers.shift()!
    retry.fn()
    await new Promise((r) => setTimeout(r, 0))
    await engine.flush()
    expect(pendingCount(store.getState())).toBe(0)
    expect(engine.getStatus().phase).toBe('idle')
  })

  it('does not lose an edit made while the upload was in flight', async () => {
    const { store, engine, fr } = setup()
    const s = store.createSession()
    const p = store.addPoint(mkPoint(s.id))
    fr.state.holdPoints = hold()
    const flushing = engine.flush()
    await new Promise((r) => setTimeout(r, 0))
    // point deleted while its upload is in flight → tombstone must still upload afterwards
    store.deletePoint(p.id)
    fr.state.holdPoints.release()
    fr.state.holdPoints = null
    await flushing
    expect(store.getState().dirty.points).toEqual([p.id])
    await engine.flush()
    expect(fr.db.points.get(p.id)?.deleted_at).toBeTruthy()
    expect(pendingCount(store.getState())).toBe(0)
  })

  it('coalesces concurrent flush calls into one in-flight run', async () => {
    const { store, engine, fr } = setup()
    const s = store.createSession()
    fr.state.holdPoints = hold()
    store.addPoint(mkPoint(s.id))
    const a = engine.flush()
    const b = engine.flush()
    expect(a).toBe(b)
    fr.state.holdPoints.release()
    fr.state.holdPoints = null
    await a
    expect(fr.calls.filter((c) => c.startsWith('sessions')).length).toBe(1)
    expect(pendingCount(store.getState())).toBe(0)
  })

  it('does nothing when signed out or offline, but reports it', async () => {
    const off = setup({ online: false })
    off.store.addPoint(mkPoint(off.store.createSession().id))
    await off.engine.flush()
    expect(off.fr.calls).toEqual([])
    expect(off.engine.getStatus()).toMatchObject({ phase: 'offline', pending: 2 })

    const out = setup({ uid: null })
    out.store.createSession()
    await out.engine.flush()
    expect(out.fr.calls).toEqual([])
    expect(out.engine.getStatus()).toMatchObject({ phase: 'signed-out', pending: 1 })
  })

  it('never uploads rows that belong to another user', async () => {
    const { store, engine, fr, ctx } = setup()
    store.createSession()
    ctx.uid = 'u2'
    store.setOwner('u2') // rows of u1 are now foreign
    engine.onAuthChanged()
    await engine.flush()
    expect(fr.calls.filter((c) => c.startsWith('sessions'))).toEqual([])
  })

  it('reports auth errors without wiping local data', async () => {
    const { store, engine, fr } = setup()
    store.createSession()
    fr.state.failSessions = { message: 'JWT expired', status: 401 }
    await engine.flush()
    expect(engine.getStatus().error).toMatch(/sign in again/)
    expect(liveSessions(store.getState())).toHaveLength(1)
  })
})

describe('pull', () => {
  it('merges remote rows (tombstones win) and does not throw on fetch errors', async () => {
    const { store, engine, fr } = setup()
    const s = store.createSession()
    const p = store.addPoint(mkPoint(s.id))
    await engine.flush()
    // another device deleted the point and added a session
    fr.db.points.set(p.id, { ...p, deleted_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T00:00:00.000Z' })
    fr.db.sessions.set('remote-s', { ...s, id: 'remote-s', title: 'Remote' })
    await engine.pull(true)
    expect(store.getState().points[p.id].deleted_at).toBeTruthy()
    expect(liveSessions(store.getState()).map((x) => x.title)).toContain('Remote')

    fr.state.failFetch = { message: 'Failed to fetch' }
    await engine.pull(true)
    expect(engine.getStatus()).toMatchObject({ phase: 'error', error: 'Network error — will retry' })
    expect(liveSessions(store.getState())).toHaveLength(2)
  })

  it('throttles automatic pulls but not forced ones', async () => {
    const { engine, fr } = setup()
    await engine.pull()
    await engine.pull()
    expect(fr.calls.filter((c) => c === 'fetch')).toHaveLength(1)
    await engine.pull(true)
    expect(fr.calls.filter((c) => c === 'fetch')).toHaveLength(2)
  })
})

describe('start', () => {
  it('flushes automatically after a write (debounced) and syncs on start', async () => {
    const { store, engine, fr, timers } = setup()
    const stop = engine.start()
    await new Promise((r) => setTimeout(r, 0))
    expect(fr.calls).toContain('fetch')
    const s = store.createSession()
    store.addPoint(mkPoint(s.id))
    const debounce = timers.find((t) => t.ms === 300)
    expect(debounce).toBeTruthy()
    debounce!.fn()
    await new Promise((r) => setTimeout(r, 0))
    await engine.flush()
    expect(pendingCount(store.getState())).toBe(0)
    stop()
  })
})

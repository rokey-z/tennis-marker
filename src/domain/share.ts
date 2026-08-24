import { isErrorType, isOutcome, isPlacementResult, isPlacementStroke, isSessionMode, isShotType, type Point, type Session } from './types'
import { cleanUtr } from './session'
import { sanitizePoint, sanitizeSession } from './validate'

type SharedSession = Pick<Session, 'title' | 'opponent' | 'opponent_utr' | 'venue' | 'date' | 'mode' | 'notes' | 'finished_at' | 'self_rating'>
type SharedPayloadV1 = {
  v: 1
  s: SharedSession
  p: [number, number, Point['stroke'], Point['error_type'], boolean, Point['outcome'], Point['placement_result'] | null, string][]
}
type SharedPayloadV2 = {
  v: 2
  s: SharedSession
  p: [number, number, Point['stroke'], Point['error_type'], boolean, Point['outcome'], Point['placement_result'] | null, Point['shot_type'] | null, string][]
}
type SharedPayload = SharedPayloadV1 | SharedPayloadV2

export interface SharedMatch {
  session: Session
  points: Point[]
}

/** Validate the deliberately-limited JSON returned by the public Supabase share function. */
export function decodeLiveSharedMatch(raw: unknown): SharedMatch | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as { session?: unknown; points?: unknown }
  const session = sanitizeSession(value.session)
  if (!session || session.kind !== 'match' || !Array.isArray(value.points)) return null
  const points: Point[] = []
  for (const rawPoint of value.points) {
    const point = sanitizePoint(rawPoint)
    if (!point || point.session_id !== session.id) return null
    points.push(point)
  }
  return { session: { ...session, user_id: null, share_token: null }, points: points.map((point) => ({ ...point, user_id: null })) }
}

/** A self-contained public link: no account or database row is needed to view it. */
export function encodeSharedMatch(session: Session, points: Point[]): string {
  const payload: SharedPayloadV2 = {
    v: 2,
    s: {
      title: session.title,
      opponent: session.opponent,
      opponent_utr: session.opponent_utr ?? null,
      venue: session.venue,
      date: session.date,
      mode: session.mode,
      notes: session.notes,
      finished_at: session.finished_at ?? null,
      self_rating: session.self_rating ?? null,
    },
    p: points
      .filter((point) => !point.deleted_at)
      .map((point) => [point.x, point.y, point.stroke, point.error_type, point.forced, point.outcome, point.placement_result ?? null, point.shot_type ?? null, point.created_at]),
  }
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

export function decodeSharedMatch(encoded: string): SharedMatch | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as Partial<SharedPayload>
    if (raw.v !== 1 && raw.v !== 2 || !raw.s || !Array.isArray(raw.p)) return null
    const s = raw.s
    if (typeof s.title !== 'string' || typeof s.opponent !== 'string' || typeof s.venue !== 'string' || typeof s.date !== 'string' || !isSessionMode(s.mode) || typeof s.notes !== 'string') return null
    if (s.self_rating !== null && s.self_rating !== undefined && (!Number.isInteger(s.self_rating) || s.self_rating < 1 || s.self_rating > 100)) return null
    const session: Session = {
      id: 'shared-match', user_id: null, title: s.title, opponent: s.opponent, venue: s.venue, date: s.date,
      opponent_utr: cleanUtr(s.opponent_utr),
      kind: 'match', mode: s.mode, notes: s.notes, finished_at: typeof s.finished_at === 'string' ? s.finished_at : null,
      self_rating: s.self_rating ?? null, created_at: '', updated_at: '', deleted_at: null,
    }
    const points: Point[] = []
    for (const [index, p] of raw.p.entries()) {
      const v2 = raw.v === 2
      const createdAt = Array.isArray(p) ? p[v2 ? 8 : 7] : null
      const shotType = Array.isArray(p) && v2 ? p[7] : null
      if (!Array.isArray(p) || p.length !== (v2 ? 9 : 8) || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isPlacementStroke(p[2]) && p[2] !== '' || !isErrorType(p[3]) && p[3] !== '' || typeof p[4] !== 'boolean' || !isOutcome(p[5]) || p[6] !== null && !isPlacementResult(p[6]) || shotType !== null && !isShotType(shotType) || typeof createdAt !== 'string') return null
      points.push({ id: `shared-${index}`, user_id: null, session_id: session.id, x: p[0], y: p[1], stroke: p[2], error_type: p[3], forced: p[4], outcome: p[5], placement_result: p[6], shot_type: shotType, created_at: createdAt, updated_at: createdAt, deleted_at: null })
    }
    return { session, points }
  } catch {
    return null
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid shared match')
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

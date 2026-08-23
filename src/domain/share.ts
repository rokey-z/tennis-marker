import { isErrorType, isOutcome, isPlacementResult, isPlacementStroke, isSessionMode, type Point, type Session } from './types'

type SharedPayload = {
  v: 1
  s: Pick<Session, 'title' | 'opponent' | 'venue' | 'date' | 'mode' | 'notes' | 'finished_at' | 'self_rating'>
  p: [number, number, Point['stroke'], Point['error_type'], boolean, Point['outcome'], Point['placement_result'] | null, string][]
}

export interface SharedMatch {
  session: Session
  points: Point[]
}

/** A self-contained public link: no account or database row is needed to view it. */
export function encodeSharedMatch(session: Session, points: Point[]): string {
  const payload: SharedPayload = {
    v: 1,
    s: {
      title: session.title,
      opponent: session.opponent,
      venue: session.venue,
      date: session.date,
      mode: session.mode,
      notes: session.notes,
      finished_at: session.finished_at ?? null,
      self_rating: session.self_rating ?? null,
    },
    p: points
      .filter((point) => !point.deleted_at)
      .map((point) => [point.x, point.y, point.stroke, point.error_type, point.forced, point.outcome, point.placement_result ?? null, point.created_at]),
  }
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

export function decodeSharedMatch(encoded: string): SharedMatch | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as Partial<SharedPayload>
    if (raw.v !== 1 || !raw.s || !Array.isArray(raw.p)) return null
    const s = raw.s
    if (typeof s.title !== 'string' || typeof s.opponent !== 'string' || typeof s.venue !== 'string' || typeof s.date !== 'string' || !isSessionMode(s.mode) || typeof s.notes !== 'string') return null
    if (s.self_rating !== null && s.self_rating !== undefined && (!Number.isInteger(s.self_rating) || s.self_rating < 1 || s.self_rating > 100)) return null
    const session: Session = {
      id: 'shared-match', user_id: null, title: s.title, opponent: s.opponent, venue: s.venue, date: s.date,
      kind: 'match', mode: s.mode, notes: s.notes, finished_at: typeof s.finished_at === 'string' ? s.finished_at : null,
      self_rating: s.self_rating ?? null, created_at: '', updated_at: '', deleted_at: null,
    }
    const points: Point[] = []
    for (const [index, p] of raw.p.entries()) {
      if (!Array.isArray(p) || p.length !== 8 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isPlacementStroke(p[2]) && p[2] !== '' || !isErrorType(p[3]) && p[3] !== '' || typeof p[4] !== 'boolean' || !isOutcome(p[5]) || p[6] !== null && !isPlacementResult(p[6]) || typeof p[7] !== 'string') return null
      points.push({ id: `shared-${index}`, user_id: null, session_id: session.id, x: p[0], y: p[1], stroke: p[2], error_type: p[3], forced: p[4], outcome: p[5], placement_result: p[6], created_at: p[7], updated_at: p[7], deleted_at: null })
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

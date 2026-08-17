import { clampToView, roundFeet } from './court'
import { isValidIso, YMD_RE } from '../lib/format'
import { cleanOpponent } from './session'
import { isErrorType, isOutcome, isSessionKind, isSessionMode, isStroke, type Point, type Session, type Stroke } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The cloud stores ids as uuid, so anything else can never be uploaded. */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : isValidIso(v) ? new Date(v).toISOString() : null)

/** Coerce an untrusted session row (backup import, hand-edited storage) or reject it. */
export function sanitizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const date = str(r.date)
  const created = isoOrNull(r.created_at)
  if (!id || !date || !YMD_RE.test(date) || !created) return null
  return {
    id,
    user_id: str(r.user_id),
    title: typeof r.title === 'string' ? r.title : '',
    opponent: typeof r.opponent === 'string' ? cleanOpponent(r.opponent) : '',
    venue: typeof r.venue === 'string' ? cleanOpponent(r.venue) : '',
    date,
    kind: isSessionKind(r.kind) ? r.kind : 'practice',
    mode: isSessionMode(r.mode) ? r.mode : 'errors',
    notes: typeof r.notes === 'string' ? r.notes : '',
    created_at: created,
    updated_at: isoOrNull(r.updated_at) ?? created,
    deleted_at: isoOrNull(r.deleted_at),
  }
}

/** Coerce an untrusted point row or reject it (unknown stroke/error, bad coords or timestamps are rejected). */
export function sanitizePoint(raw: unknown): Point | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const session_id = str(r.session_id)
  const x = num(r.x)
  const y = num(r.y)
  const created = isoOrNull(r.created_at)
  if (!id || !session_id || x === null || y === null || !created) return null
  const outcome = isOutcome(r.outcome) ? r.outcome : 'error'
  // an opponent winner has neither stroke nor error type; anything else must name a stroke
  if (outcome !== 'winner' && !isStroke(r.stroke)) return null
  if (outcome === 'error' && !isErrorType(r.error_type)) return null
  const c = clampToView(x, y)
  return {
    id,
    user_id: str(r.user_id),
    session_id,
    x: roundFeet(c.x),
    y: roundFeet(c.y),
    stroke: outcome === 'winner' ? '' : (r.stroke as Stroke),
    error_type: outcome === 'error' ? (r.error_type as Point['error_type']) : '',
    outcome,
    forced: outcome === 'error' && (r.forced === true || r.forced === 'true' || r.forced === 1),
    created_at: created,
    updated_at: isoOrNull(r.updated_at) ?? created,
    deleted_at: isoOrNull(r.deleted_at),
  }
}

import { clampToView, roundFeet } from './court'
import { isValidIso, YMD_RE } from '../lib/format'
import { cleanOpponent, cleanUtr } from './session'
import { isErrorType, isOutcome, isPlacementResult, isPlacementStroke, isPointShotType, isServeMissType, isSessionKind, isSessionMode, isShotType, isStroke, type Point, type Session } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The cloud stores ids as uuid, so anything else can never be uploaded. */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : isValidIso(v) ? new Date(v).toISOString() : null)
const ratingOrNull = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 100 ? n : null
}

/** Coerce an untrusted session row (backup import, hand-edited storage) or reject it. */
export function sanitizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const date = str(r.date)
  const created = isoOrNull(r.created_at)
  if (!id || !date || !YMD_RE.test(date) || !created) return null
  const session: Session = {
    id,
    user_id: str(r.user_id),
    title: typeof r.title === 'string' ? r.title : '',
    opponent: typeof r.opponent === 'string' ? cleanOpponent(r.opponent) : '',
    venue: typeof r.venue === 'string' ? cleanOpponent(r.venue) : '',
    date,
    kind: isSessionKind(r.kind) ? r.kind : 'practice',
    mode: isSessionMode(r.mode) ? r.mode : 'errors',
    notes: typeof r.notes === 'string' ? r.notes : '',
    finished_at: isoOrNull(r.finished_at),
    self_rating: ratingOrNull(r.self_rating),
    created_at: created,
    updated_at: isoOrNull(r.updated_at) ?? created,
    deleted_at: isoOrNull(r.deleted_at),
  }
  if ('opponent_utr' in r) session.opponent_utr = cleanUtr(r.opponent_utr)
  if ('share_token' in r) session.share_token = isUuid(r.share_token) ? r.share_token : null
  return session
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
  const rawOutcome = isOutcome(r.outcome) ? r.outcome : 'error'
  // Older FH/BH placement-net rows predate explicit net errors. A Serve net miss is now a
  // deliberate placement result and must remain inside the separate Serve category.
  const legacyNet = rawOutcome === 'placement' && r.placement_result === 'net' && r.stroke !== 'serve'
  const outcome = legacyNet ? 'error' : rawOutcome
  // an opponent winner has no stroke; placements and player winners may also be serves
  const doubleFault = outcome === 'error' && r.stroke === 'serve' && isServeMissType(r.shot_type)
  const acceptsServe = outcome === 'placement' || outcome === 'player_winner' || outcome === 'winning_serve' || doubleFault
  if (outcome !== 'winner' && !(acceptsServe ? isPlacementStroke(r.stroke) : isStroke(r.stroke))) return null
  if (outcome === 'error' && !doubleFault && !legacyNet && !isErrorType(r.error_type)) return null
  const c = clampToView(x, y)
  return {
    id,
    user_id: str(r.user_id),
    session_id,
    x: roundFeet(c.x),
    y: roundFeet(c.y),
    stroke: outcome === 'winner' ? '' : (r.stroke as Point['stroke']),
    error_type: legacyNet ? 'net' : outcome === 'error' && !doubleFault ? (r.error_type as Point['error_type']) : '',
    outcome,
    placement_result: outcome === 'placement' ? (isPlacementResult(r.placement_result) ? r.placement_result : 'unknown') : null,
    shot_type:
      doubleFault
        ? 'double_fault'
        : outcome === 'error' && isShotType(r.shot_type)
        ? r.shot_type
        : outcome === 'player_winner' && (r.stroke === 'serve' ? r.shot_type === 'ace' : isShotType(r.shot_type)) && isPointShotType(r.shot_type)
          ? r.shot_type
          : outcome === 'winning_serve' && r.stroke === 'serve' && r.shot_type === 'winning_serve'
            ? 'winning_serve'
          : null,
    forced: outcome === 'error' && !doubleFault && (r.forced === true || r.forced === 'true' || r.forced === 1),
    created_at: created,
    updated_at: isoOrNull(r.updated_at) ?? created,
    deleted_at: isoOrNull(r.deleted_at),
  }
}

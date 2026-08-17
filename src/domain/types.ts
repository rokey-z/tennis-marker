export type Stroke = 'fh' | 'bh'
export type ErrorType = 'long' | 'net' | 'wide'
export type SessionKind = 'match' | 'practice'
/** What a session records: her errors on her own half, or where her balls landed on the far half. */
export type SessionMode = 'errors' | 'placement'
/**
 * What a mark records:
 *   error / winner — recorded in Errors mode, positioned where SHE was on her half
 *   placement      — recorded in Placement mode, positioned where the BALL LANDED on the far half
 */
export type Outcome = 'error' | 'winner' | 'placement'

export const STROKES: Stroke[] = ['fh', 'bh']
export const ERROR_TYPES: ErrorType[] = ['long', 'net', 'wide']
export const OUTCOMES: Outcome[] = ['error', 'winner', 'placement']

export const STROKE_LABEL: Record<Stroke, string> = { fh: 'Forehand', bh: 'Backhand' }
export const STROKE_SHORT: Record<Stroke, string> = { fh: 'FH', bh: 'BH' }
export const ERROR_LABEL: Record<ErrorType, string> = { long: 'Long', net: 'Net', wide: 'Wide' }
export const SESSION_KINDS: SessionKind[] = ['match', 'practice']
export const KIND_LABEL: Record<SessionKind, string> = { match: 'Match', practice: 'Practice' }
export const KIND_PLURAL: Record<SessionKind, string> = { match: 'Matches', practice: 'Practices' }
export const SESSION_MODES: SessionMode[] = ['errors', 'placement']
export const MODE_LABEL: Record<SessionMode, string> = { errors: 'Errors', placement: 'Placement' }
export const MODE_HINT: Record<SessionMode, string> = {
  errors: 'Tap her half where she lost the point, then pick the stroke and error.',
  placement: 'Shows the far half: press where the ball landed and drag left for backhand, right for forehand.',
}

export const isStroke = (v: unknown): v is Stroke => v === 'fh' || v === 'bh'
export const isErrorType = (v: unknown): v is ErrorType => v === 'long' || v === 'net' || v === 'wide'
export const isOutcome = (v: unknown): v is Outcome => v === 'error' || v === 'winner' || v === 'placement'
export const isSessionKind = (v: unknown): v is SessionKind => v === 'match' || v === 'practice'
export const isSessionMode = (v: unknown): v is SessionMode => v === 'errors' || v === 'placement'

/** A match or practice; groups points. Timestamps are ISO strings, dates are YYYY-MM-DD. */
export interface Session {
  id: string
  user_id: string | null
  /** Legacy free-text name from older versions; the UI derives the label instead (see domain/session.ts). */
  title: string
  /** Who she played (optional); '' when unknown. */
  opponent: string
  /** Where it was played (club / court name, optional). */
  venue: string
  date: string
  kind: SessionKind
  /** Sessions record one thing or the other; the court and the gesture follow from this. */
  mode: SessionMode
  notes: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * One recorded mark. What x/y MEAN depends on the outcome — these are two different measurements
 * that happen to share a column:
 *   error / winner → where the PLAYER was standing, on her half
 *   placement      → where the BALL LANDED, on the far half (y is depth from the net)
 * Position is in court feet, in the player's own frame:
 * x: 0 = center line, positive = deuce side (her right when facing the net)
 * y: 0 = net, 39 = baseline, up to 51 (12 ft behind the baseline)
 */
export interface Point {
  id: string
  user_id: string | null
  session_id: string
  x: number
  y: number
  /** Her stroke; '' for an opponent winner, which is nobody's stroke of hers. */
  stroke: Stroke | ''
  /** How it ended; '' for winners, which have no error type. */
  error_type: ErrorType | ''
  outcome: Outcome
  /** Only meaningful for errors. */
  forced: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type NewPoint = Pick<Point, 'session_id' | 'x' | 'y' | 'stroke' | 'error_type' | 'forced'> & { outcome?: Outcome }

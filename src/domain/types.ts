export type Stroke = 'fh' | 'bh'
export type ErrorType = 'long' | 'net' | 'wide'
export type SessionKind = 'match' | 'practice'
/** How the point ended: she made an error, or she hit a winner. */
export type Outcome = 'error' | 'winner'

export const STROKES: Stroke[] = ['fh', 'bh']
export const ERROR_TYPES: ErrorType[] = ['long', 'net', 'wide']
export const OUTCOMES: Outcome[] = ['error', 'winner']

export const STROKE_LABEL: Record<Stroke, string> = { fh: 'Forehand', bh: 'Backhand' }
export const STROKE_SHORT: Record<Stroke, string> = { fh: 'FH', bh: 'BH' }
export const ERROR_LABEL: Record<ErrorType, string> = { long: 'Long', net: 'Net', wide: 'Wide' }
export const SESSION_KINDS: SessionKind[] = ['match', 'practice']
export const KIND_LABEL: Record<SessionKind, string> = { match: 'Match', practice: 'Practice' }

export const isStroke = (v: unknown): v is Stroke => v === 'fh' || v === 'bh'
export const isErrorType = (v: unknown): v is ErrorType => v === 'long' || v === 'net' || v === 'wide'
export const isOutcome = (v: unknown): v is Outcome => v === 'error' || v === 'winner'
export const isSessionKind = (v: unknown): v is SessionKind => v === 'match' || v === 'practice'

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
  notes: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * One lost point. Position is in court feet, in the player's own frame:
 * x: 0 = center line, positive = deuce side (her right when facing the net)
 * y: 0 = net, 39 = baseline, up to 51 (12 ft behind the baseline)
 */
export interface Point {
  id: string
  user_id: string | null
  session_id: string
  x: number
  y: number
  stroke: Stroke
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

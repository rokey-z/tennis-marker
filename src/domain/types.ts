export type Stroke = 'fh' | 'bh'
/** A serve is only recorded as a landing in Placement mode, never as an error stroke. */
export type PlacementStroke = Stroke | 'serve'
export type PlacementResult = 'in' | 'net' | 'wide' | 'long' | 'unknown'
export type ErrorType = 'long' | 'net' | 'wide'
/** The kind of ball attempted when an error was made. */
export type ShotType = 'ground' | 'slice' | 'approach' | 'volley' | 'swing_volley' | 'overhead' | 'lob' | 'drop'
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
export const PLACEMENT_STROKES: PlacementStroke[] = ['fh', 'bh', 'serve']
export const ERROR_TYPES: ErrorType[] = ['long', 'net', 'wide']
export const SHOT_TYPE_GROUPS: ShotType[][] = [
  ['ground', 'approach', 'slice'],
  ['volley', 'swing_volley', 'overhead'],
  ['lob', 'drop'],
]
export const SHOT_TYPES: ShotType[] = SHOT_TYPE_GROUPS.flat()
export const OUTCOMES: Outcome[] = ['error', 'winner', 'placement']

export const STROKE_LABEL: Record<PlacementStroke, string> = { fh: 'Forehand', bh: 'Backhand', serve: 'Serve' }
export const STROKE_SHORT: Record<PlacementStroke, string> = { fh: 'FH', bh: 'BH', serve: 'S' }
export const ERROR_LABEL: Record<ErrorType, string> = { long: 'Long', net: 'Net', wide: 'Wide' }
export const SHOT_TYPE_LABEL: Record<ShotType, string> = {
  ground: 'Neutral',
  slice: 'Slice',
  approach: 'Attack',
  volley: 'Volley',
  swing_volley: 'Swing volley',
  overhead: 'Overhead',
  lob: 'Lob',
  drop: 'Drop shot',
}
/** Compact labels used where every ball type must fit inside a court-map zone. */
export const SHOT_TYPE_SHORT: Record<ShotType, string> = {
  ground: 'N',
  slice: 'S',
  approach: 'A',
  volley: 'V',
  swing_volley: 'SV',
  overhead: 'O',
  lob: 'L',
  drop: 'D',
}
export const SESSION_KINDS: SessionKind[] = ['match', 'practice']
export const KIND_LABEL: Record<SessionKind, string> = { match: 'Match', practice: 'Practice' }
export const KIND_PLURAL: Record<SessionKind, string> = { match: 'Matches', practice: 'Practices' }
export const SESSION_MODES: SessionMode[] = ['errors', 'placement']
export const MODE_LABEL: Record<SessionMode, string> = { errors: 'Errors', placement: 'Placement' }
export const MODE_HINT: Record<SessionMode, string> = {
  errors: 'Press where she lost the point, drag into the FH/BH × Wide/Long/Net wheel, or beyond it for a winner.',
  placement: 'Shows the far half: drag left for backhand, right for forehand, or up for a serve landing. Mark the net to log a Net error.',
}

export const isStroke = (v: unknown): v is Stroke => v === 'fh' || v === 'bh'
export const isPlacementStroke = (v: unknown): v is PlacementStroke => isStroke(v) || v === 'serve'
export const isPlacementResult = (v: unknown): v is PlacementResult => v === 'in' || v === 'net' || v === 'wide' || v === 'long' || v === 'unknown'
export const isErrorType = (v: unknown): v is ErrorType => v === 'long' || v === 'net' || v === 'wide'
export const isShotType = (v: unknown): v is ShotType => v === 'ground' || v === 'slice' || v === 'approach' || v === 'volley' || v === 'swing_volley' || v === 'overhead' || v === 'lob' || v === 'drop'
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
  /** Set when recording is finished; a finished session is read-only until explicitly unlocked. */
  finished_at?: string | null
  /** Player's editable 1–100 assessment of the finished session. */
  self_rating?: number | null
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
  stroke: PlacementStroke | ''
  /** How it ended; '' for winners, which have no error type. */
  error_type: ErrorType | ''
  outcome: Outcome
  /** Placement-mode result; null for Errors and Winners. */
  placement_result?: PlacementResult | null
  /** Error-mode shot category selected after Long / Net / Wide. */
  shot_type?: ShotType | null
  /** Only meaningful for errors. */
  forced: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type NewPoint = Pick<Point, 'session_id' | 'x' | 'y' | 'stroke' | 'error_type' | 'forced'> & { outcome?: Outcome; placement_result?: PlacementResult | null; shot_type?: ShotType | null }

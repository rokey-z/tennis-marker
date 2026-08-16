import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKE_SHORT, STROKES, isErrorType, isStroke, type ErrorType, type Outcome, type Stroke } from '../domain/types'

/**
 * One sign system, used identically when adding, editing and viewing a point:
 *
 *   colour  = stroke        forehand = amber, backhand = ink
 *   letter  = error type    L long · N net · W wide — the word's own initial
 *   fill    = forced        solid = unforced (the common case), dark outline = forced
 *   shape   = outcome       round = an error she made, diamond ◆ = a winner she hit
 *
 * Colours live in CSS (--fh / --bh) so marks, tags and chart bars are literally the same value.
 * The pair is a lightness contrast rather than two hues: it survives sunlight, cheap screens and
 * every kind of colour blindness (separation ΔE ≈ 43–49, far above the ΔE 8 floor).
 */

/** The icon for an error type is its initial — the short form of the word it stands for. */
export const ERROR_LETTER: Record<ErrorType, string> = { long: 'L', net: 'N', wide: 'W' }

/** Plain-language name of a mark, for tooltips and screen readers. */
export function markLabel(stroke: Stroke, error: ErrorType | '', forced: boolean, outcome: Outcome = 'error'): string {
  if (outcome === 'winner') return `${STROKE_LABEL[stroke]} winner`
  const err = isErrorType(error) ? ERROR_LABEL[error].toLowerCase() : 'error'
  return `${STROKE_LABEL[stroke]} ${err}, ${forced ? 'forced' : 'unforced'}`
}

/** Compact form of an error type: the letter that appears inside the court marks. */
export function ErrorLetter({ type, className = '' }: { type: ErrorType; className?: string }) {
  return (
    <span className={`letter ${className}`.trim()} title={ERROR_LABEL[type]}>
      {ERROR_LETTER[type]}
    </span>
  )
}

/** FH / BH pill — the colour is the identity, the letters are the label. */
export function StrokeTag({ stroke }: { stroke: Stroke }) {
  return (
    <span className={`tag ${stroke}`} title={STROKE_LABEL[stroke]}>
      {STROKE_SHORT[stroke]}
    </span>
  )
}

/** The full sign: stroke tag + error shape + word (+ forced). Same component in the log and the sheet. */
export function MarkChip({ stroke, error, forced, outcome = 'error', word = true }: { stroke: Stroke; error: ErrorType | ''; forced: boolean; outcome?: Outcome; word?: boolean }) {
  const safeStroke = isStroke(stroke) ? stroke : 'fh'
  const winner = outcome === 'winner'
  const safeError = isErrorType(error) ? error : 'long'
  return (
    <span className={`mark ${safeStroke}${forced ? ' forced' : ''}`} title={markLabel(safeStroke, error, forced, outcome)}>
      <StrokeTag stroke={safeStroke} />
      <span className="mark-sign">{winner ? 'Winner' : word ? ERROR_LABEL[safeError] : ERROR_LETTER[safeError]}</span>
      {winner && <span className="mark-win">◆</span>}
      {forced && !winner && <span className="mark-forced">forced</span>}
    </span>
  )
}

/** Round mark used on the court and in the point-by-point strip (DOM version). */
export function MarkDot({ stroke, error, forced, outcome = 'error', size = 26, title }: { stroke: Stroke; error: ErrorType | ''; forced: boolean; outcome?: Outcome; size?: number; title?: string }) {
  const winner = outcome === 'winner'
  return (
    <span
      className={`dot ${stroke}${forced && !winner ? ' forced' : ''}${winner ? ' winner' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (winner ? 0.46 : 0.52)) }}
      title={title ?? markLabel(stroke, error, forced, outcome)}
    >
      {winner ? '★' : isErrorType(error) ? ERROR_LETTER[error] : '?'}
    </span>
  )
}

/** The key to the signs — identical wherever marks are shown. */
export function MarkLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`mark-legend ${className}`.trim()}>
      <span className="ml-group">
        {STROKES.map((s) => (
          <span key={s} className="ml-item">
            <StrokeTag stroke={s} />
            {STROKE_LABEL[s]}
          </span>
        ))}
      </span>
      <span className="ml-group">
        {ERROR_TYPES.map((e) => (
          <span key={e} className="ml-item">
            <ErrorLetter type={e} />
            {ERROR_LABEL[e]}
          </span>
        ))}
      </span>
      <span className="ml-group">
        <span className="ml-item">
          <span className="ml-ring" aria-hidden="true" />
          Forced
        </span>
        <span className="ml-item">
          <span className="ml-win" aria-hidden="true">
            ★
          </span>
          Winner
        </span>
      </span>
    </div>
  )
}

/** BH left, FH right — one tag per column, then a round button per error type, in the mark's colour. */
const GRID_COLUMNS: Stroke[] = ['bh', 'fh']

export function ShotGrid({
  current,
  forced = false,
  winner = false,
  onPick,
  onPickWinner,
}: {
  current?: { stroke: Stroke; error: ErrorType | ''; outcome?: Outcome } | null
  forced?: boolean
  /** Winner mode: one button per stroke, since a winner has no error type. */
  winner?: boolean
  onPick: (stroke: Stroke, error: ErrorType) => void
  onPickWinner?: (stroke: Stroke) => void
}) {
  if (winner) {
    return (
      <div className="shot-grid">
        {GRID_COLUMNS.map((stroke) => (
          <div key={stroke} className="sg-head">
            <StrokeTag stroke={stroke} />
          </div>
        ))}
        {GRID_COLUMNS.map((stroke) => {
          const sel = current?.outcome === 'winner' && current?.stroke === stroke
          return (
            <button
              key={stroke}
              type="button"
              className={`sg-btn ${stroke}${sel ? ' sel' : ''}`}
              aria-pressed={current ? sel : undefined}
              aria-label={`${STROKE_LABEL[stroke]} winner`}
              title={`${STROKE_LABEL[stroke]} winner`}
              onClick={() => onPickWinner?.(stroke)}
            >
              ★ Winner
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="shot-grid">
      {GRID_COLUMNS.map((stroke) => (
        <div key={stroke} className="sg-head">
          <StrokeTag stroke={stroke} />
        </div>
      ))}
      {ERROR_TYPES.map((err) =>
        GRID_COLUMNS.map((stroke) => {
          const sel = current?.outcome !== 'winner' && current?.stroke === stroke && current?.error === err
          return (
            <button
              key={`${stroke}-${err}`}
              type="button"
              className={`sg-btn ${stroke}${sel ? ' sel' : ''}`}
              aria-pressed={current ? sel : undefined}
              aria-label={`${STROKE_LABEL[stroke]} ${ERROR_LABEL[err]}`}
              title={markLabel(stroke, err, forced)}
              onClick={() => onPick(stroke, err)}
            >
              {ERROR_LABEL[err]}
            </button>
          )
        }),
      )}
    </div>
  )
}

import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKE_SHORT, STROKES, isErrorType, isPlacementStroke, type ErrorType, type Outcome, type PlacementResult, type PlacementStroke, type Stroke } from '../domain/types'

/**
 * One sign system, used identically when adding, editing and viewing a point:
 *
 *   colour  = stroke        forehand = amber, backhand = ink
 *   letter  = error type    L long · N net · W wide — the word's own initial
 *   fill    = forced        solid = unforced (the common case), dark outline = forced
 *   shape   = outcome       round = an error she made, green diamond ◆ = a winner the OPPONENT hit
 *
 * A winner is the opponent's shot, so it carries no stroke of hers and no colour of her own —
 * it is the one neutral sign in the set.
 *
 * Colours live in CSS (--fh / --bh) so marks, tags and chart bars are literally the same value.
 * The pair is a lightness contrast rather than two hues: it survives sunlight, cheap screens and
 * every kind of colour blindness (separation ΔE ≈ 43–49, far above the ΔE 8 floor).
 */

/** The icon for an error type is its initial — the short form of the word it stands for. */
export const ERROR_LETTER: Record<ErrorType, string> = { long: 'L', net: '×', wide: 'W' }

/** Plain-language name of a mark, for tooltips and screen readers. */
export function markLabel(stroke: PlacementStroke | '', error: ErrorType | '', forced: boolean, outcome: Outcome = 'error', out = false, placementResult?: PlacementResult | null): string {
  if (outcome === 'winner') return 'Opponent winner'
  if (outcome === 'player_winner') return `${isPlacementStroke(stroke) ? STROKE_LABEL[stroke] : 'Player'} winner`
  if (outcome === 'winning_serve') return 'Winning serve'
  if (!isPlacementStroke(stroke)) return 'Point'
  if (outcome === 'placement') {
    const result = placementResult === 'unknown' ? 'landing recorded' : placementResult ? placementResult : out ? 'landed out' : 'landed in'
    return `${STROKE_LABEL[stroke]} — ${result}`
  }
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
export function StrokeTag({ stroke }: { stroke: PlacementStroke }) {
  return (
    <span className={`tag ${stroke}`} title={STROKE_LABEL[stroke]}>
      {STROKE_SHORT[stroke]}
    </span>
  )
}

/** The full sign: stroke tag + error shape + word (+ forced). Same component in the log and the sheet. */
export function MarkChip({ stroke, error, forced, outcome = 'error', out = false, placementResult, word = true }: { stroke: PlacementStroke | ''; error: ErrorType | ''; forced: boolean; outcome?: Outcome; out?: boolean; placementResult?: PlacementResult | null; word?: boolean }) {
  // a winner is the opponent's shot: no stroke tag, no forced flag, nothing to attribute to her
  if (outcome === 'winner') {
    return (
      <span className="mark winner" title="The opponent hit a winner">
        <MarkDot stroke="" error="" forced={false} outcome="winner" size={18} />
        <span className="mark-sign">Opponent winner</span>
      </span>
    )
  }
  if (outcome === 'player_winner') {
    const safeStroke = isPlacementStroke(stroke) ? stroke : 'fh'
    return (
      <span className={`mark ${safeStroke} player-winner`} title={markLabel(safeStroke, '', false, outcome)}>
        <MarkDot stroke={safeStroke} error="" forced={false} outcome={outcome} size={18} />
        <StrokeTag stroke={safeStroke} />
        <span className="mark-sign">Winner</span>
      </span>
    )
  }
  if (outcome === 'winning_serve') {
    return (
      <span className="mark serve winning-serve" title="Winning serve">
        <MarkDot stroke="serve" error="" forced={false} outcome="winning_serve" size={18} />
        <StrokeTag stroke="serve" />
        <span className="mark-sign">Winning serve</span>
      </span>
    )
  }
  const safeStroke = isPlacementStroke(stroke) ? stroke : 'fh'
  const safeError = isErrorType(error) ? error : 'long'
  return (
    <span className={`mark ${safeStroke}${forced ? ' forced' : ''}`} title={markLabel(safeStroke, error, forced, outcome, out, placementResult)}>
      {/* the same sign the court draws: a lettered dot is an error, a plain dot or cross is a landing */}
      <MarkDot stroke={safeStroke} error={error} forced={forced} outcome={outcome} out={out} placementResult={placementResult} size={18} />
      <StrokeTag stroke={safeStroke} />
      <span className="mark-sign">{outcome === 'placement' ? placementResult === 'unknown' ? 'Landing recorded' : placementResult ? placementResult[0].toUpperCase() + placementResult.slice(1) : out ? 'Landed out' : 'Landed in' : word ? ERROR_LABEL[safeError] : ERROR_LETTER[safeError]}</span>
      {forced && <span className="mark-forced">forced</span>}
    </span>
  )
}

/** Round mark used on the court and in the point-by-point strip (DOM version). */
export function MarkDot({ stroke, error, forced, outcome = 'error', out = false, placementResult, size = 26, title }: { stroke: PlacementStroke | ''; error: ErrorType | ''; forced: boolean; outcome?: Outcome; out?: boolean; placementResult?: PlacementResult | null; size?: number; title?: string }) {
  const opponentWinner = outcome === 'winner'
  const playerWinner = outcome === 'player_winner'
  const winningServe = outcome === 'winning_serve'
  const winner = opponentWinner || playerWinner
  return (
    <span
      className={`dot ${isPlacementStroke(stroke) ? stroke : 'none'}${forced && !winner && !winningServe ? ' forced' : ''}${opponentWinner ? ' winner' : ''}${playerWinner ? ' player-winner' : ''}${winningServe ? ' winning-serve' : ''}${out || placementResult === 'net' ? ' out' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (winner ? 0.46 : 0.52)) }}
      title={title ?? markLabel(stroke, error, forced, outcome, out, placementResult)}
    >
      {winner ? '★' : winningServe ? 'S' : outcome === 'placement' ? (out || placementResult === 'net' ? '✕' : '') : isErrorType(error) ? ERROR_LETTER[error] : '·'}
    </span>
  )
}

/** The key to the signs — identical wherever marks are shown. */
export function MarkLegend({ className = '', mode = 'errors' }: { className?: string; mode?: 'errors' | 'placement' }) {
  const placement = mode === 'placement'
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
      {placement ? (
        <span className="ml-group">
          <span className="ml-item">
            <MarkDot stroke="fh" error="" forced={false} outcome="placement" size={14} />
            Landed in
          </span>
          <span className="ml-item">
            <MarkDot stroke="fh" error="" forced={false} outcome="placement" out size={14} />
            Landed out
          </span>
          <span className="ml-item">
            <MarkDot stroke="fh" error="net" forced={false} outcome="error" size={14} />
            Net error
          </span>
        </span>
      ) : (
        <>
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
              Opponent winner
            </span>
            <span className="ml-item">
              <span className="ml-player-win" aria-hidden="true">★</span>
              Player winner
            </span>
          </span>
        </>
      )}
    </div>
  )
}

/** BH left, FH right — one tag per column, then a round button per error type, in the mark's colour. */
const GRID_COLUMNS: Stroke[] = ['bh', 'fh']

export function ShotGrid({
  current,
  forced = false,
  strokeOnly = false,
  onPick,
}: {
  current?: { stroke: PlacementStroke | ''; error: ErrorType | ''; outcome?: Outcome } | null
  forced?: boolean
  /** Placement mode: one button per stroke, with no outcome at all. */
  strokeOnly?: boolean
  onPick: (stroke: Stroke, error: ErrorType) => void
}) {
  if (strokeOnly) {
    return (
      <div className="shot-grid">
        {GRID_COLUMNS.map((stroke) => {
          const sel = current?.stroke === stroke
          return (
            <button
              key={stroke}
              type="button"
              className={`sg-btn ${stroke}${sel ? ' sel' : ''}`}
              aria-pressed={current ? sel : undefined}
              aria-label={STROKE_LABEL[stroke]}
              title={STROKE_LABEL[stroke]}
              onClick={() => onPick(stroke, 'long')}
            >
              {STROKE_LABEL[stroke]}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="shot-grid">
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
              <span className="sg-stroke">{STROKE_SHORT[stroke]}</span>
              <span>{ERROR_LABEL[err]}</span>
            </button>
          )
        }),
      )}
    </div>
  )
}

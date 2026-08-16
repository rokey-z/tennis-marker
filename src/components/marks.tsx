import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKE_SHORT, STROKES, isErrorType, isStroke, type ErrorType, type Stroke } from '../domain/types'

/**
 * One sign system, used identically when adding, editing and viewing a point:
 *
 *   colour  = stroke        forehand = amber, backhand = ink
 *   shape   = error type    ▲ long (over the line) · ▬ net · ▶ wide (out to the side)
 *   fill    = forced        solid = unforced (the common case), outlined ring = forced
 *
 * Colours live in CSS (--fh / --bh) so marks, tags and chart bars are literally the same value.
 * The pair is a lightness contrast rather than two hues: it survives sunlight, cheap screens and
 * every kind of colour blindness (separation ΔE ≈ 43–49, far above the ΔE 8 floor).
 */

/** Shape centred on 0,0 in whatever units the caller draws in — one definition for DOM and court SVG. */
export function errorShapePath(type: ErrorType, s: number): string {
  switch (type) {
    case 'long': // triangle up: past the far line
      return `M0 ${-s} L ${s * 0.92} ${s * 0.64} L ${-s * 0.92} ${s * 0.64} Z`
    case 'wide': // triangle right: out to the side
      return `M ${s} 0 L ${-s * 0.64} ${-s * 0.92} L ${-s * 0.64} ${s * 0.92} Z`
    case 'net': // bar: the net itself
      return `M ${-s} ${-s * 0.36} H ${s} V ${s * 0.36} H ${-s} Z`
  }
}

/** Plain-language name of a mark, for tooltips and screen readers. */
export function markLabel(stroke: Stroke, error: ErrorType, forced: boolean): string {
  return `${STROKE_LABEL[stroke]} ${ERROR_LABEL[error].toLowerCase()}, ${forced ? 'forced' : 'unforced'}`
}

export function ErrorGlyph({ type, size = 13 }: { type: ErrorType; size?: number }) {
  const h = size / 2
  return (
    <svg className="glyph" width={size} height={size} viewBox={`${-h} ${-h} ${size} ${size}`} aria-hidden="true" focusable="false">
      <path d={errorShapePath(type, h * 0.82)} fill="currentColor" />
    </svg>
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
export function MarkChip({ stroke, error, forced, word = true }: { stroke: Stroke; error: ErrorType; forced: boolean; word?: boolean }) {
  const safeStroke = isStroke(stroke) ? stroke : 'fh'
  const safeError = isErrorType(error) ? error : 'long'
  return (
    <span className={`mark ${safeStroke}${forced ? ' forced' : ''}`} title={markLabel(safeStroke, safeError, forced)}>
      <StrokeTag stroke={safeStroke} />
      <span className="mark-sign">
        <ErrorGlyph type={safeError} />
        {word && <span className="mark-word">{ERROR_LABEL[safeError]}</span>}
      </span>
      {forced && <span className="mark-forced">forced</span>}
    </span>
  )
}

/** Round mark used on the court and in the point-by-point strip (DOM version). */
export function MarkDot({ stroke, error, forced, size = 26, title }: { stroke: Stroke; error: ErrorType; forced: boolean; size?: number; title?: string }) {
  const h = size / 2
  return (
    <span className={`dot ${stroke}${forced ? ' forced' : ''}`} style={{ width: size, height: size }} title={title ?? markLabel(stroke, error, forced)}>
      <svg width={size} height={size} viewBox={`${-h} ${-h} ${size} ${size}`} aria-hidden="true" focusable="false">
        <path d={errorShapePath(error, h * 0.46)} fill="currentColor" />
      </svg>
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
            <ErrorGlyph type={e} />
            {ERROR_LABEL[e]}
          </span>
        ))}
      </span>
      <span className="ml-group">
        <span className="ml-item">
          <span className="ml-ring" aria-hidden="true" />
          Forced
        </span>
      </span>
    </div>
  )
}

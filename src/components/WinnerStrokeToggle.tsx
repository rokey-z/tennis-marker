import { STROKE_SHORT, type PlacementStroke } from '../domain/types'

const WINNER_STROKES: PlacementStroke[] = ['bh', 'fh', 'serve']

export function WinnerStrokeToggle({ value, onChange }: { value: PlacementStroke; onChange: (stroke: PlacementStroke) => void }) {
  return (
    <div className="winner-stroke-toggle" role="group" aria-label="Winner stroke">
      {WINNER_STROKES.map((stroke) => (
        <button
          type="button"
          key={stroke}
          className={`${stroke}${value === stroke ? ' on' : ''}`}
          aria-pressed={value === stroke}
          onClick={() => onChange(stroke)}
        >
          {stroke === 'serve' ? 'Serve' : STROKE_SHORT[stroke]}
        </button>
      ))}
    </div>
  )
}

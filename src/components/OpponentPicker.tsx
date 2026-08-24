import { useId, type ReactNode } from 'react'
import { cleanOpponent, defaultOpponentPlaceholder, opponentKey, type OpponentRow } from '../domain/session'
import type { SessionKind } from '../domain/types'

export interface OpponentPickerProps {
  value: string
  onChange: (value: string) => void
  kind: SessionKind
  /** Everyone she has played before — the top few become one-tap chips. */
  known: OpponentRow[]
  label?: string
  /** how many quick chips to show */
  maxChips?: number
  /** Optional session-only field displayed immediately after the opponent name. */
  afterInput?: ReactNode
}

/** Text field + one-tap chips for recent opponents (no typing for someone she has played before). */
export function OpponentPicker({ value, onChange, kind, known, label = 'Opponent', maxChips = 6, afterInput }: OpponentPickerProps) {
  const listId = useId()
  const current = opponentKey(value)
  const chips = known.slice(0, maxChips)
  return (
    <div className="opponent-picker">
      <div className="opponent-fields">
        <label className="field grow">
          <span>{label}</span>
          <input
            className="input"
            list={listId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={defaultOpponentPlaceholder(kind)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
          />
        </label>
        {afterInput}
      </div>
      <datalist id={listId}>
        {known.map((o) => (
          <option key={o.key} value={o.name} />
        ))}
      </datalist>
      {chips.length > 0 && (
        <div className="chip-group opponent-chips">
          {chips.map((o) => {
            const on = current === o.key
            return (
              <button
                key={o.key}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange(on ? '' : o.name)}
                title={`${o.sessions} session${o.sessions === 1 ? '' : 's'}`}
              >
                {o.name}
              </button>
            )
          })}
          {cleanOpponent(value) !== '' && (
            <button type="button" className="chip clear" onClick={() => onChange('')}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Chart palette — the same CSS custom properties the marks use, so one entity has one colour
 * everywhere (a forehand bar is the forehand amber). Only the chart-only series (error type,
 * forced) add their own validated hues.
 */
export const CHART = {
  total: 'var(--chart-total)',
  fh: 'var(--fh)',
  bh: 'var(--bh)',
  long: 'var(--err-long)',
  net: 'var(--err-net)',
  wide: 'var(--err-wide)',
  doubleFaults: 'var(--err-double-fault)',
  unforced: 'var(--chart-unforced)',
  forced: 'var(--err-forced)',
  avg: 'var(--muted)',
  spark: 'var(--line)',
  grid: 'var(--line)',
} as const

export function useMeasure<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.getBoundingClientRect().width)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Nice axis max + integer ticks (0 … max) for count axes. */
export function niceTicks(maxValue: number, target = 4): { max: number; ticks: number[] } {
  const raw = Math.max(1, Math.ceil(maxValue))
  let step = 1
  if (raw > target) {
    const rough = raw / target
    const pow = 10 ** Math.floor(Math.log10(rough))
    step = [1, 2, 5, 10].map((m) => m * pow).find((s) => raw / s <= target) ?? 10 * pow
  }
  const max = Math.ceil(raw / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return { max, ticks }
}

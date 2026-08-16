import { useEffect, useRef, useState, type RefObject } from 'react'

/** Chart palette — validated for the white card surface (see dataviz notes in README). */
export const CHART = {
  total: '#2a78d6',
  fh: '#e08e00',
  bh: '#3d4699',
  long: '#2a78d6',
  net: '#1baf7a',
  wide: '#4a3aa7',
  unforced: '#2a78d6',
  forced: '#e34948',
  avg: '#5b6672',
  spark: '#c9d1d9',
  grid: '#e3e8ed',
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

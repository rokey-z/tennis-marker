import type { StatsFilterState } from './StatsPanel'

export function toggleStatsFilter<K extends keyof StatsFilterState>(
  value: StatsFilterState,
  key: K,
  next: StatsFilterState[K],
): StatsFilterState {
  return { ...value, [key]: value[key] === next ? 'all' : next } as StatsFilterState
}

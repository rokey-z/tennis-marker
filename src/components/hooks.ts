import { useEffect, useState } from 'react'
import { todayLocalISO } from '../lib/format'
import { playerWords, type PlayerWords } from '../domain/session'
import { useAppState } from '../data/app'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export const useIsDesktop = () => useMediaQuery('(min-width: 900px)')

/** Local calendar date (YYYY-MM-DD) that ticks over at midnight and refreshes when the tab regains focus. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayLocalISO())
  useEffect(() => {
    const refresh = () => setToday((prev) => (prev === todayLocalISO() ? prev : todayLocalISO()))
    const scheduleMidnight = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      return window.setTimeout(() => {
        refresh()
        timer = scheduleMidnight()
      }, next.getTime() - now.getTime())
    }
    let timer = scheduleMidnight()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return today
}

/** The player's name (or pronouns) for UI copy. */
export function usePlayer(): PlayerWords {
  const state = useAppState()
  return playerWords(state.meta.playerName)
}

import { KIND_LABEL, type Session, type SessionKind } from './types'

/** Titles the old versions generated automatically ("Match 2026-08-15") — never worth showing. */
const AUTO_TITLE_RE = /^(Match|Practice)\s+\d{4}-\d{2}-\d{2}$/

export function isAutoTitle(title: string): boolean {
  return !title.trim() || AUTO_TITLE_RE.test(title.trim())
}

/** Opponent names are compared case- and space-insensitively so "emma " and "Emma" are one person. */
export function opponentKey(name: string | null | undefined): string {
  return cleanOpponent(name).toLowerCase()
}

/** Tolerates missing values so a row written by an older version can never crash a screen. */
export function cleanOpponent(name: string | null | undefined): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
}

/** A session snapshot of the opponent's UTR. Empty/invalid values stay unset. */
export function cleanUtr(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) && n >= 0.01 && n <= 16.5 ? Math.round(n * 100) / 100 : null
}

export function formatUtr(value: unknown): string {
  const utr = cleanUtr(value)
  return utr === null ? '' : String(utr)
}

/**
 * Opponent from a legacy free-text title, but ONLY when the title clearly names one
 * ("vs Emma — club ladder" → "Emma"). Anything else ("Practice — groundstrokes") is left alone
 * and keeps showing as-is, so the migration can never invent an opponent.
 */
export function opponentFromLegacyTitle(title: string): string {
  const t = title.trim()
  if (isAutoTitle(t)) return ''
  const m = /^(?:vs\.?|versus|against)\s+(.+)$/i.exec(t)
  if (!m) return ''
  const head = m[1].split(/\s+[—–|·]\s+|\s+-\s+|,\s*/)[0]
  return cleanOpponent(head)
}

/** Display name, derived from the fields — there is no title to type. */
export function sessionLabel(s: Pick<Session, 'kind' | 'opponent' | 'opponent_utr' | 'title'>): string {
  const opponent = cleanOpponent(s.opponent ?? '')
  if (opponent) {
    if (s.kind !== 'match') return `Practice with ${opponent}`
    const utr = formatUtr(s.opponent_utr)
    return `vs ${opponent}${utr ? ` · UTR ${utr}` : ''}`
  }
  // rows recorded before opponents existed keep showing whatever was typed back then
  const legacy = (s.title ?? '').trim()
  if (legacy && !isAutoTitle(legacy)) return legacy
  return KIND_LABEL[s.kind]
}

export function defaultOpponentPlaceholder(kind: SessionKind): string {
  return kind === 'match' ? 'e.g. Emma' : 'e.g. Coach Dan (optional)'
}

export interface TagRow {
  /** display spelling (most recently used) */
  name: string
  key: string
  sessions: number
  matches: number
  /** most recent session date (YYYY-MM-DD) */
  lastDate: string
}
export type OpponentRow = TagRow

/** Distinct values of a free-text session field, newest first — used for opponents and venues. */
export function tagRows(sessions: Iterable<Session>, pick: (s: Session) => string): TagRow[] {
  const byKey = new Map<string, TagRow>()
  for (const s of sessions) {
    if (s.deleted_at) continue
    const name = cleanOpponent(pick(s) ?? '')
    if (!name) continue
    const key = opponentKey(name)
    const row = byKey.get(key)
    if (!row) {
      byKey.set(key, { name, key, sessions: 1, matches: s.kind === 'match' ? 1 : 0, lastDate: s.date })
    } else {
      row.sessions++
      if (s.kind === 'match') row.matches++
      if (s.date > row.lastDate) {
        row.lastDate = s.date
        row.name = name // keep the most recent spelling
      }
    }
  }
  return [...byKey.values()].sort((a, b) => (a.lastDate === b.lastDate ? b.sessions - a.sessions : a.lastDate < b.lastDate ? 1 : -1))
}

/** Everyone she has played, derived from the sessions themselves (newest first). */
export const opponentRows = (sessions: Iterable<Session>): TagRow[] => tagRows(sessions, (s) => s.opponent)
/** Places she has played (newest first). */
export const venueRows = (sessions: Iterable<Session>): TagRow[] => tagRows(sessions, (s) => s.venue)

/** Opponent list for pickers and management: everyone from the sessions, plus names added by hand. */
export function opponentRowsWithRoster(sessions: Iterable<Session>, roster: Iterable<string> = []): TagRow[] {
  const rows = opponentRows(sessions)
  const seen = new Set(rows.map((r) => r.key))
  const extra: TagRow[] = []
  for (const raw of roster) {
    const name = cleanOpponent(raw)
    const key = opponentKey(name)
    if (!name || seen.has(key)) continue
    seen.add(key)
    extra.push({ name, key, sessions: 0, matches: 0, lastDate: '' })
  }
  // names not used yet sit after the ones she has actually played
  return [...rows, ...extra.sort((a, b) => a.name.localeCompare(b.name))]
}

/** Who the app is for, unless a device or a build says otherwise. */
const DEFAULT_NAME = 'Lily'
/** Build-time override so a different family can name their own player. */
const CONFIGURED_NAME = (import.meta.env?.VITE_PLAYER_NAME ?? DEFAULT_NAME) as string

export interface PlayerWords {
  /** "Lily" — or '' when nobody has been named */
  name: string
  /** "Lily" / "she" — use at the start of a sentence with capitalise() */
  subject: string
  /** "Lily’s" / "her" */
  possessive: string
}

/** How to refer to the player in copy: her name when there is one, pronouns when there isn't. */
export function playerWords(stored: string | null | undefined): PlayerWords {
  const name = cleanOpponent(stored) || cleanOpponent(CONFIGURED_NAME)
  return name ? { name, subject: name, possessive: `${name}’s` } : { name: '', subject: 'she', possessive: 'her' }
}

export const capitalise = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

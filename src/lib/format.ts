/** Local calendar date as YYYY-MM-DD (no timezone shift). */
export function todayLocalISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parse YYYY-MM-DD as a local-midnight Date; null if malformed. */
export function parseYMD(ymd: string): Date | null {
  if (!YMD_RE.test(ymd)) return null
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function isValidIso(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && !Number.isNaN(new Date(s).getTime())
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** YYYY-MM-DD → "Sat, Aug 15, 2026" in the user's locale (local time, no TZ shift). */
export function formatDate(ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }): string {
  const d = parseYMD(ymd)
  return d ? d.toLocaleDateString([], opts) : ymd || '—'
}

/** "Aug 15" */
export const shortDate = (ymd: string) => formatDate(ymd, { month: 'short', day: 'numeric' })
/** "Sat" */
export const weekday = (ymd: string) => formatDate(ymd, { weekday: 'short' })

/** Minutes → "42 min" / "1 h 5 min" / "2 h" (rounded to whole minutes first). */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min < 0) return '—'
  const r = Math.round(min)
  if (r < 1) return '<1 min'
  if (r < 60) return `${r} min`
  const h = Math.floor(r / 60)
  const m = r % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

import { describeZone, zoneFor } from './court'
import { sessionLabel } from './session'
import type { Point, Session } from './types'

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADER = [
  'session',
  'opponent',
  'session_date',
  'session_kind',
  'point_time',
  'outcome',
  'x_ft',
  'y_ft',
  'zone',
  'stroke',
  'placement_result',
  'error_type',
  'forced',
] as const

/** One row per live point (session order newest→oldest is left to the caller). */
export function pointsToCsv(points: Iterable<Point>, sessionsById: Record<string, Session>): string {
  const lines = [CSV_HEADER.join(',')]
  for (const p of points) {
    if (p.deleted_at) continue
    const s = sessionsById[p.session_id]
    lines.push(
      [
        csvEscape(s ? sessionLabel(s) : ''),
        csvEscape(s?.opponent ?? ''),
        csvEscape(s?.date ?? ''),
        csvEscape(s?.kind ?? ''),
        csvEscape(p.created_at),
        csvEscape(p.outcome ?? 'error'),
        csvEscape(p.x),
        csvEscape(p.y),
        csvEscape(describeZone(zoneFor(p.x, p.y))),
        csvEscape(p.stroke),
        csvEscape(p.placement_result ?? ''),
        csvEscape(p.error_type),
        csvEscape(p.forced ? 'forced' : 'unforced'),
      ].join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export interface ExportBundle {
  app: 'tennis-marker'
  version: 1
  exported_at: string
  sessions: Session[]
  points: Point[]
}

export function toExportBundle(sessions: Session[], points: Point[], now = new Date()): ExportBundle {
  return {
    app: 'tennis-marker',
    version: 1,
    exported_at: now.toISOString(),
    sessions: sessions.filter((s) => !s.deleted_at),
    points: points.filter((p) => !p.deleted_at),
  }
}

export function parseExportBundle(text: string): ExportBundle {
  const data = JSON.parse(text) as Partial<ExportBundle>
  if (data.app !== 'tennis-marker' || !Array.isArray(data.sessions) || !Array.isArray(data.points)) {
    throw new Error('Not a Tennis Marker export file')
  }
  return data as ExportBundle
}

export function safeFilename(base: string, ext: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  const slug = base.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'
  return `${slug}-${stamp}.${ext}`
}

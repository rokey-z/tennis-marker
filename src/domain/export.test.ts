import { describe, expect, it } from 'vitest'
import { csvEscape, parseExportBundle, pointsToCsv, safeFilename, toExportBundle } from './export'
import type { Point, Session } from './types'

const t0 = '2026-08-15T10:00:00.000Z'
const s1: Session = {
  id: 's1',
  user_id: null,
  title: '',
  opponent: 'Emma "Fast" Lee',
  venue: 'Riverside Club',
  date: '2026-08-15',
  kind: 'match',
  notes: '',
  created_at: t0,
  updated_at: t0,
  deleted_at: null,
}
const p1: Point = {
  id: 'p1',
  user_id: null,
  session_id: 's1',
  x: 10.5,
  y: 41,
  stroke: 'fh',
  error_type: 'long',
  outcome: 'error',
  forced: false,
  created_at: t0,
  updated_at: t0,
  deleted_at: null,
}

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"')
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(3.5)).toBe('3.5')
  })

  it('writes header + one row per live point with zone and session info', () => {
    const csv = pointsToCsv([p1, { ...p1, id: 'p2', deleted_at: t0 }], { s1 })
    const lines = csv.trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('session,opponent,session_date,session_kind,point_time,outcome,x_ft,y_ft,zone,stroke,error_type,forced')
    expect(lines[1]).toBe(
      `"vs Emma ""Fast"" Lee","Emma ""Fast"" Lee",2026-08-15,match,${t0},error,10.5,41,Baseline · deuce side,fh,long,unforced`,
    )
  })
})

describe('winners in the csv', () => {
  it('marks the outcome and leaves the error type empty', () => {
    const w: Point = { ...p1, id: 'w1', outcome: 'winner', error_type: '', forced: false }
    const line = pointsToCsv([w], { s1 }).trimEnd().split('\r\n')[1]
    expect(line).toContain(',winner,')
    expect(line.endsWith(',fh,,unforced')).toBe(true)
  })
})

describe('json bundle', () => {
  it('round-trips and drops deleted rows', () => {
    const bundle = toExportBundle([s1, { ...s1, id: 's2', deleted_at: t0 }], [p1], new Date(t0))
    const parsed = parseExportBundle(JSON.stringify(bundle))
    expect(parsed.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(parsed.points).toEqual([p1])
    expect(parsed.exported_at).toBe(t0)
  })

  it('rejects foreign files', () => {
    expect(() => parseExportBundle('{"foo":1}')).toThrow(/Not a Tennis Marker/)
  })

  it('makes safe filenames', () => {
    expect(safeFilename('vs "Emma", finals', 'csv', new Date(t0))).toBe('vs-emma-finals-2026-08-15.csv')
    expect(safeFilename('!!!', 'json', new Date(t0))).toBe('export-2026-08-15.json')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordPage = readFileSync(new URL('./RecordPage.tsx', import.meta.url), 'utf8')
const sharedMatchPage = readFileSync(new URL('./SharedMatchPage.tsx', import.meta.url), 'utf8')

describe('stats court markers', () => {
  it.each([
    ['session stats', recordPage],
    ['shared stats', sharedMatchPage],
  ])('keeps opponent winners visible on the %s court', (_name, source) => {
    expect(source).not.toContain("shownPoints.filter((point) => point.outcome !== 'winner')")
    expect(source).toContain('points={shownPoints}')
    expect(source).toContain('className="stats-map-winner-mark" aria-hidden="true">★</span> Opponent winners')
  })
})

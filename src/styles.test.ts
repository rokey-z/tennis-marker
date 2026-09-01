/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const recordPage = readFileSync(new URL('./pages/RecordPage.tsx', import.meta.url), 'utf8')

describe('action button contrast', () => {
  it('uses the high-contrast purple serve text color for an unselected Double fault label', () => {
    const rule = styles.match(/\.double-fault-toggle\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(styles).toContain('--serve-text: #6d28d9')
    expect(rule).toContain('background: var(--surface)')
    expect(rule).toContain('color: var(--serve-text)')
  })
})

describe('mobile session header', () => {
  it('uses compact icon and number-only controls without changing desktop labels', () => {
    const start = styles.indexOf('@media (max-width: 560px) {', styles.indexOf('.flip-fab.on'))
    const end = styles.indexOf('.court-fullscreen-exit', start)
    const mobile = styles.slice(start, end)

    expect(mobile).toContain('.record-head-actions .header-rating-button')
    expect(mobile).toContain('.record-head-actions .header-finish')
    expect(mobile).toContain('width: 38px')
    expect(mobile).toContain('.header-rating-button small')
    expect(mobile).toContain('.header-rating-button strong span')
    expect(mobile).toContain('.header-finish-label')
    expect(mobile).toContain('display: none')
  })
})

describe('mobile stats court', () => {
  it('keeps one stable court height while the whole stats page scrolls', () => {
    expect(styles).toContain('.record.stats .record-court')
    expect(styles).toMatch(/\.record\.stats \.court-box\s*\{[^}]*height:\s*50dvh;/s)
    expect(styles).toMatch(/\.record\.stats \.record-stats\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*visible;/s)
    expect(styles.lastIndexOf('.record.stats .record-stats')).toBeGreaterThan(styles.indexOf('\n.record-stats {'))
    expect(styles).not.toContain('stats-map-compact')
    expect(recordPage).not.toContain('statsMapCompact')
    expect(recordPage).not.toContain('setStatsMapCompact')
  })

  it('lays out every ball type across multiple compact rows', () => {
    expect(styles).toMatch(/\.stats-filter-ball-types\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3, max-content\);/s)
  })

  it('renders each filter percentage as a pie chart with compact text below', () => {
    expect(styles).toMatch(/\.stats-filter-pie-visual\s*\{[^}]*border-radius:\s*50%;[^}]*conic-gradient\([^}]*var\(--filter-share\)/s)
    expect(styles).toMatch(/\.stats-filter-pie-name\s*\{[^}]*font-size:\s*8px;/s)
  })
})

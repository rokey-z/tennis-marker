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

  it('puts force, stroke, and error on top with ball type alone on the second row', () => {
    expect(styles).toMatch(/\.stats-filters-track\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3, minmax\(194px, 1fr\)\);/s)
    expect(styles).toMatch(/\.stats-filters-row\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;/s)
    expect(styles).toMatch(/\.stats-filters-row:nth-child\(4\)\s*\{[^}]*grid-column:\s*1 \/ -1;/s)
    expect(styles).toMatch(/\.stats-filter-pie-layout\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*44px 96px 44px;/s)
    expect(styles).toMatch(/\.stats-filter-zero-items\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s)
  })

  it('renders one interactive combined pie per category with compact labels beside it', () => {
    expect(styles).toMatch(/\.stats-filter-combined-pie\s*\{[^}]*width:\s*96px;[^}]*height:\s*96px;/s)
    expect(styles).toMatch(/\.stats-filters-row:nth-child\(4\) \.stats-filter-combined-pie\s*\{[^}]*width:\s*144px;[^}]*height:\s*144px;/s)
    expect(styles).toMatch(/\.stats-filter-pie-sector\s*\{[^}]*cursor:\s*pointer;/s)
    expect(styles).toMatch(/\.stats-filter-pie-name\s*\{[^}]*font-size:\s*10px;/s)
    expect(styles).toMatch(/\.stats-filter-orbit-label \.stats-filter-count\s*\{[^}]*font-size:\s*9px;/s)
  })
})

describe('desktop stats layout', () => {
  it('uses court, filters, and analysis as three distinct columns', () => {
    expect(recordPage).toContain("statsMode && !placementMode ? ' stats-with-filters' : ''")
    expect(recordPage).toContain('className="record-stats-filters"')
    expect(styles).toMatch(/\.record\.stats-with-filters\s*\{[^}]*grid-template-columns:\s*minmax\(280px, 1fr\) minmax\(240px, 320px\) minmax\(300px, 400px\);[^}]*'court filters side';/s)
    expect(styles).toMatch(/\.record-stats-filters\s*\{[^}]*grid-area:\s*filters;[^}]*overflow:\s*auto;/s)
    expect(styles).toMatch(/\.record-stats-filters \.stats-filters-track\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s)
  })

  it('shows a compact active-filter summary above the four groups', () => {
    expect(styles).toMatch(/\.stats-filter-selection\s*\{[^}]*display:\s*flex;[^}]*border-radius:/s)
  })
})

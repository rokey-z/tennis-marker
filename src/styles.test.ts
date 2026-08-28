/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('action button contrast', () => {
  it('uses the high-contrast purple serve text color for an unselected Double fault label', () => {
    const rule = styles.match(/\.double-fault-toggle\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(styles).toContain('--serve-text: #6d28d9')
    expect(rule).toContain('background: var(--surface)')
    expect(rule).toContain('color: var(--serve-text)')
  })
})

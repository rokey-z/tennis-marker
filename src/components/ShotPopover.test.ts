import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ShotPopover } from './ShotPopover'

describe('ShotPopover player winner flow', () => {
  it('offers BH, FH, and Serve with a separate winner confirmation', () => {
    const html = renderToStaticMarkup(createElement(ShotPopover, {
      anchor: { clientX: 100, clientY: 100 },
      containerRef: createRef<HTMLElement>(),
      where: 'Baseline · middle',
      forced: false,
      onForcedChange: vi.fn(),
      onPick: vi.fn(),
      onWinner: vi.fn(),
      winnerOnly: true,
      onPlayerWinner: vi.fn(),
      player: { name: '', subject: 'she', possessive: 'her' },
      onCancel: vi.fn(),
    }))

    expect(html).toContain('>BH<')
    expect(html).toContain('>FH<')
    expect(html).toContain('>Serve<')
    expect(html).toContain('✓ Winner')
    expect(html).toContain('class="winner-confirm" disabled=""')
  })
})

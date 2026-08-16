import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const BackIcon = () => (
  <svg {...base}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)
export const FlipIcon = () => (
  <svg {...base}>
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
)
export const UndoIcon = () => (
  <svg {...base}>
    <path d="M3 7v6h6" />
    <path d="M3.5 13A9 9 0 1 0 6 5.3L3 8" />
  </svg>
)
export const ListIcon = () => (
  <svg {...base}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
)
export const ChartIcon = () => (
  <svg {...base}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 4 3 5-7" />
  </svg>
)
export const PencilIcon = () => (
  <svg {...base}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
)
export const RefreshIcon = () => (
  <svg {...base}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </svg>
)
export const PinIcon = () => (
  <svg {...base}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
)
export const DashboardIcon = () => (
  <svg {...base}>
    <rect x="3" y="3" width="8" height="10" rx="1.5" />
    <rect x="13" y="3" width="8" height="6" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" />
    <rect x="3" y="15" width="8" height="6" rx="1.5" />
  </svg>
)
export const SessionsIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 2v4M16 2v4" />
  </svg>
)
export const SettingsIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)
export const TrashIcon = () => (
  <svg {...base}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
)
export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const DownloadIcon = () => (
  <svg {...base}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </svg>
)

/** App mark: green rounded square, white half-court, amber ball. */
export const LogoIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#3d7dc0" />
    <rect x="12" y="10" width="40" height="44" fill="none" stroke="#fff" strokeWidth="3" />
    <path d="M12 32h40M32 10v22" stroke="#fff" strokeWidth="3" />
    <circle cx="44" cy="44" r="6" fill="#ffb020" />
  </svg>
)

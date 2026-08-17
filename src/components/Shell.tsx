import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { DashboardIcon, LogoIcon, SessionsIcon, SettingsIcon } from './Icons'
import { SyncBadge } from './Bits'

const TABS = [
  { to: '/', label: 'Sessions', Icon: SessionsIcon },
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export function Shell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="shell page-in">
      <header className="app-head">
        <h1 className="brand">
          <LogoIcon />
          <span>{title}</span>
        </h1>
        <nav className="desktop-nav" aria-label="Primary">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        {actions}
        <SyncBadge />
      </header>
      <main className="shell-main">{children}</main>
      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <t.Icon />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { shell } from '@/lib/design-tokens'

interface Seat {
  href: string
  label: string
  match: (path: string) => boolean
  icon: React.ReactNode
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const SEATS: Seat[] = [
  {
    href: '/home',
    label: 'Home',
    match: (p) => p === '/home' || p === '/',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" /></svg>,
  },
  {
    href: '/check-in',
    label: 'Check in',
    match: (p) => p.startsWith('/check-in'),
    icon: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" /></svg>,
  },
  {
    href: '/idea-lab',
    label: 'Ideas',
    match: (p) => p.startsWith('/idea-lab') || p.startsWith('/collector'),
    icon: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M19 15l.7 1.6 1.6.7-1.6.7L19 19.6l-.7-1.6-1.6-.7 1.6-.7z" /></svg>,
  },
  {
    href: '/project-board',
    label: 'Board',
    match: (p) => p.startsWith('/project-board') || p.startsWith('/write') || p.startsWith('/zoom-out') || p.startsWith('/post-publication') || p.startsWith('/read'),
    icon: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="8" rx="1.5" /></svg>,
  },
  {
    href: '/portrait',
    label: 'Portrait',
    match: (p) => p.startsWith('/portrait'),
    icon: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>,
  },
]

/** Breakpoint where the dock moves from the bottom (phone) to the top (desktop). */
export const DOCK_DESKTOP_MIN = 720

/**
 * The one navigation. Top-centre on desktop, bottom-centre on phones (thumb
 * reach, and it never covers a page header). Replaces every bespoke back
 * button. Page-specific actions stay in the header cluster.
 */
export function Dock({ hidden = false }: { hidden?: boolean }) {
  const pathname = usePathname() || ''
  if (hidden) return null
  return (
    <nav aria-label="Main" className="dock">
      <style>{`
        .dock { position: fixed; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; gap: 2px; padding: 4px; border-radius: 999px; background-color: rgba(13,12,11,0.74); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid ${shell.line}; box-shadow: 0 10px 30px rgba(0,0,0,0.45); max-width: calc(100vw - 24px); }
        .dock { bottom: max(14px, env(safe-area-inset-bottom)); top: auto; }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .dock { top: 14px; bottom: auto; } }
        .dock-seat { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 999px; color: ${shell.muted}; text-decoration: none; font-family: var(--font-geist-sans); font-size: 12px; font-weight: 600; letter-spacing: 0.02em; transition: color .2s, background-color .2s; -webkit-tap-highlight-color: transparent; }
        .dock-seat:hover, .dock-seat[aria-current="page"] { color: ${shell.text}; background-color: ${shell.fillHover}; }
        .dock-seat:focus-visible { outline: 2px solid #d2552f; outline-offset: 2px; }
        .dock-seat .dock-label { display: none; }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .dock-seat .dock-label { display: inline; } }
        @media (max-width: ${DOCK_DESKTOP_MIN - 1}px) { .dock-seat { padding: 0 13px; height: 44px; } }
      `}</style>
      {SEATS.map((s) => {
        const on = s.match(pathname)
        return (
          <Link key={s.href} href={s.href} className="dock-seat" aria-current={on ? 'page' : undefined} aria-label={s.label} title={s.label}>
            {s.icon}
            <span className="dock-label">{s.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

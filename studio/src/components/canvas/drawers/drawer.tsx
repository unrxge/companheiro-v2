'use client'

// studio/src/components/canvas/drawers/drawer.tsx — the right drawer primitive
// (6.4, D-045): slides from the right over the dock, 420 wide (draft 760,
// `wider` → 100 %), surface containerBg, 1 px chrome hairline on the left edge,
// drawer shadow; the canvas stays pannable and undimmed. Chromeless drawers
// (talk, draft) own their header and use DrawerHeader + useDrawerChrome().

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { motion as m, useReducedMotion } from 'motion/react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, geometry, line, motionSpec, shadow, zIndex } from '@/lib/studio/canvas-tokens'

export interface DrawerChrome {
  close(): void
  wider: boolean
  setWider(v: boolean): void
}

export const DrawerChromeContext = createContext<DrawerChrome | null>(null)

const noChrome: DrawerChrome = { close() {}, wider: false, setWider() {} }

/** Close / wider controls for content that draws its own header (talk, draft). */
export function useDrawerChrome(): DrawerChrome {
  return useContext(DrawerChromeContext) ?? noChrome
}

/** A 28 px hit icon on the drawer's surface (theme-following, unlike the glass chrome). */
export function DrawerIcon({ icon, onClick, ariaLabel }: { icon: ReactNode; onClick: () => void; ariaLabel: string }) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="studio-icon"
      style={{
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        color: t.textSecondary,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {icon}
    </button>
  )
}

export function DrawerHeader({
  eyebrow,
  title,
  right,
  showWider = false,
}: {
  eyebrow?: string
  title: ReactNode
  right?: ReactNode
  /** Adds the `wider` toggle before the close button. */
  showWider?: boolean
}) {
  const { t } = useTheme()
  const chrome = useDrawerChrome()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        padding: '18px 20px 14px',
        borderBottom: `1px solid ${t.divider}`,
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && <div style={{ ...canvasType.eyebrow, color: t.textMuted, marginBottom: 4 }}>{eyebrow}</div>}
        <div style={{ ...canvasType.title, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {right}
        {showWider && (
          <DrawerIcon
            ariaLabel={chrome.wider ? 'narrower' : 'wider'}
            onClick={() => chrome.setWider(!chrome.wider)}
            icon={chrome.wider ? <Minimize2 size={16} strokeWidth={1.5} /> : <Maximize2 size={16} strokeWidth={1.5} />}
          />
        )}
        <DrawerIcon ariaLabel="close" onClick={chrome.close} icon={<X size={16} strokeWidth={1.5} />} />
      </div>
    </div>
  )
}

export function Drawer({
  width = geometry.drawerW,
  wider = false,
  eyebrow,
  title,
  headerActions,
  chromeless = false,
  showWider = false,
  children,
  style,
  ariaLabel,
}: {
  width?: number
  wider?: boolean
  eyebrow?: string
  title?: ReactNode
  headerActions?: ReactNode
  /** The content draws its own header (DrawerHeader). */
  chromeless?: boolean
  showWider?: boolean
  children: ReactNode
  style?: CSSProperties
  ariaLabel?: string
}) {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  return (
    <m.aside
      role="complementary"
      aria-label={ariaLabel}
      data-drawer
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: reduce ? 0 : motionSpec.drawerMs / 1000, ease: [0.2, 0.7, 0.2, 1] }}
      style={{
        position: 'absolute',
        top: geometry.topBarH,
        right: 0,
        bottom: 0,
        width: wider ? '100%' : width,
        maxWidth: '100%',
        backgroundColor: t.containerBg,
        borderLeft: `1px solid ${line.chrome}`,
        boxShadow: shadow.drawer,
        zIndex: zIndex.drawer,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease, background-color 0.3s ease',
        ...style,
      }}
    >
      {!chromeless && <DrawerHeader eyebrow={eyebrow} title={title ?? ''} right={headerActions} showWider={showWider} />}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </m.aside>
  )
}

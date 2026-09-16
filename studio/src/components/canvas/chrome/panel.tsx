'use client'

// studio/src/components/canvas/chrome/panel.tsx — the ink-glass primitive and the
// small glass controls every chrome panel is built from (6.4, D-045). Chrome
// never toggles with the theme: everything here is ink, hairlines and Geist Mono.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { alpha, fonts, shell, tokensFor } from '@/lib/design-tokens'

/** Chrome never toggles with the theme (D-044): its meaning colours are the dark set. */
const INK = tokensFor('dark')
import { canvasType, geometry, glass, line, motionSpec, radii, zIndex } from '@/lib/studio/canvas-tokens'

// ── one-time CSS for hover motion, tooltips and the world's tidy transition ──

export const CHROME_CSS = `
.studio-icon { transition: transform ${motionSpec.hoverMs}ms ease, opacity ${motionSpec.hoverMs}ms ease; opacity: .7; }
.studio-icon:hover { transform: translateY(-1px); opacity: 1; }
.studio-icon[data-active="true"] { opacity: 1; }
.studio-icon:disabled { opacity: .3; transform: none; cursor: default; }
.studio-tip { position: relative; }
.studio-tip::after {
  content: attr(data-tip); position: absolute; left: 50%; top: calc(100% + 6px); transform: translateX(-50%);
  font-family: ${fonts.ui}; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: .08em; text-transform: uppercase;
  color: ${shell.text}; background: rgba(13,12,11,0.92); padding: 5px 7px; border-radius: 4px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity 120ms ease 0ms; z-index: ${zIndex.dialog};
}
.studio-tip[data-tip-side="top"]::after { top: auto; bottom: calc(100% + 6px); }
.studio-tip[data-tip-side="left"]::after { top: 50%; left: auto; right: calc(100% + 8px); transform: translateY(-50%); }
.studio-tip[data-tip-side="right"]::after { top: 50%; left: calc(100% + 8px); transform: translateY(-50%); }
.studio-tip:hover::after { opacity: 1; transition-delay: 400ms; }
.studio-row { transition: background-color ${motionSpec.hoverMs}ms ease; }
.studio-row:hover { background-color: ${glass.rowHover}; }
.studio-row[data-active="true"] { background-color: ${glass.rowActive}; }
.studio-row .studio-row-tools { opacity: 0; transition: opacity ${motionSpec.hoverMs}ms ease; }
.studio-row:hover .studio-row-tools, .studio-row .studio-row-tools[data-on="true"] { opacity: 1; }
.studio-glass-input::placeholder { color: rgba(236,233,226,0.35); }
.studio-glass-input:focus { outline: none; border-color: rgba(236,233,226,0.35) !important; }
[data-block-id][data-dragging] [data-surface] { box-shadow: 0 12px 28px rgba(0,0,0,0.45); transition: box-shadow 120ms ease; }
[data-world].tidying [data-block-id] { transition: transform ${motionSpec.tidyMs}ms ease; }
@media (prefers-reduced-motion: reduce) {
  .studio-icon, .studio-row, [data-world].tidying [data-block-id] { transition: none !important; }
}
`

/** Mount once per canvas root (CanvasPage, PhoneStage). */
export function ChromeStyles() {
  return <style>{CHROME_CSS}</style>
}

// ── the glass surface ──────────────────────────────────────────────────────

export function Panel({
  width,
  children,
  style,
  ariaLabel,
  padding = 0,
}: {
  width?: number | string
  children: ReactNode
  style?: CSSProperties
  ariaLabel?: string
  padding?: number | string
}) {
  return (
    <div
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      style={{
        width,
        backgroundColor: glass.bg,
        backdropFilter: glass.filter,
        WebkitBackdropFilter: glass.filter,
        border: `1px solid ${line.chrome}`,
        borderRadius: radii.panel,
        color: glass.text,
        padding,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function PanelHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px' }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div style={{ ...canvasType.eyebrow, color: glass.muted }}>{eyebrow}</div>}
        <div style={{ ...canvasType.title, fontSize: 15, color: glass.text, marginTop: eyebrow ? 2 : 0 }}>{title}</div>
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

export function PanelSection({ label, children, style, flush = false }: { label?: string; children: ReactNode; style?: CSSProperties; flush?: boolean }) {
  return (
    <div style={{ padding: flush ? 0 : '8px 16px 12px', borderTop: `1px solid ${line.chromeSoft}`, ...style }}>
      {label && <div style={{ ...canvasType.label, color: glass.muted, marginBottom: 8, padding: flush ? '8px 16px 0' : 0 }}>{label}</div>}
      {children}
    </div>
  )
}

export function PanelHint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...canvasType.meta, color: glass.muted, ...style }}>{children}</div>
}

// ── rows and buttons ───────────────────────────────────────────────────────

export function GlassRow({
  children,
  onClick,
  onDoubleClick,
  active = false,
  style,
  indent = 0,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dataId,
}: {
  children: ReactNode
  onClick?: () => void
  onDoubleClick?: () => void
  active?: boolean
  style?: CSSProperties
  indent?: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
  dataId?: string
}) {
  return (
    <div
      className="studio-row"
      data-active={active ? 'true' : undefined}
      data-id={dataId}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 32,
        padding: `4px 12px 4px ${12 + indent}px`,
        borderRadius: 8,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

type Tone = 'text' | 'tide' | 'danger' | 'muted'

const toneColor = (tone: Tone): string =>
  tone === 'tide' ? INK.tide : tone === 'danger' ? INK.danger : tone === 'muted' ? glass.muted : glass.text

export function GlassButton({
  children,
  onClick,
  tone = 'text',
  mono = false,
  disabled = false,
  icon,
  block = false,
  tip,
  ariaLabel,
  style,
  small = false,
}: {
  children?: ReactNode
  onClick?: () => void
  tone?: Tone
  mono?: boolean
  disabled?: boolean
  icon?: ReactNode
  block?: boolean
  tip?: string
  ariaLabel?: string
  style?: CSSProperties
  small?: boolean
}) {
  const [hover, setHover] = useState(false)
  const typo = mono ? { ...canvasType.meta, letterSpacing: '0.02em' } : { ...canvasType.small, fontWeight: 500 }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={tip ? 'studio-tip' : undefined}
      data-tip={tip}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        ...typo,
        display: block ? 'flex' : 'inline-flex',
        width: block ? '100%' : undefined,
        alignItems: 'center',
        gap: 8,
        padding: small ? '4px 8px' : '6px 10px',
        borderRadius: 8,
        border: `1px solid ${hover && !disabled ? line.chrome : 'transparent'}`,
        backgroundColor: hover && !disabled ? glass.rowHover : 'transparent',
        color: toneColor(tone),
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: `background-color ${motionSpec.hoverMs}ms ease, border-color ${motionSpec.hoverMs}ms ease`,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  )
}

/** A rail or context-bar icon: 16 px lucide inside a 28/48 px hit area, hover = translateY(−1) + opacity .7→1. */
export function IconHit({
  icon,
  onClick,
  active = false,
  tip,
  tipSide = 'bottom',
  ariaLabel,
  size = 28,
  disabled = false,
  tone = 'text',
  dot = false,
}: {
  icon: ReactNode
  onClick?: () => void
  active?: boolean
  tip?: string
  tipSide?: 'top' | 'bottom' | 'left' | 'right'
  ariaLabel: string
  size?: number
  disabled?: boolean
  tone?: Tone
  dot?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={`studio-icon${tip ? ' studio-tip' : ''}`}
      data-active={active ? 'true' : undefined}
      data-tip={tip}
      data-tip-side={tipSide}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: 'none',
        backgroundColor: active ? glass.rowActive : 'transparent',
        color: toneColor(tone),
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {icon}
      {dot && (
        <i
          aria-hidden
          style={{ position: 'absolute', top: size <= 28 ? 3 : 10, right: size <= 28 ? 3 : 10, width: 6, height: 6, borderRadius: '50%', backgroundColor: INK.tide }}
        />
      )}
    </button>
  )
}

export function GlassToggle({
  label,
  keycap,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  keycap?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="studio-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        minHeight: 32,
        padding: '4px 8px 4px 12px',
        border: 'none',
        borderRadius: 8,
        backgroundColor: 'transparent',
        color: glass.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, ...canvasType.small, fontWeight: 500 }}>
        {label}
        {keycap && <KeyCap>{keycap}</KeyCap>}
      </span>
      <span
        aria-hidden
        style={{
          width: 28,
          height: 16,
          borderRadius: 999,
          border: `1px solid ${checked ? INK.tide : line.chrome}`,
          backgroundColor: checked ? alpha(INK.tide, 0.35) : shell.fill,
          position: 'relative',
          flexShrink: 0,
          transition: `background-color ${motionSpec.hoverMs}ms ease, border-color ${motionSpec.hoverMs}ms ease`,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 13 : 2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: checked ? INK.tide : glass.muted,
            transition: `left ${motionSpec.hoverMs}ms ease`,
          }}
        />
      </span>
    </button>
  )
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        ...canvasType.label,
        fontSize: 10,
        color: glass.muted,
        backgroundColor: shell.fill,
        border: `1px solid ${line.chromeSoft}`,
        borderRadius: 4,
        padding: '2px 5px',
        textTransform: 'none',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </kbd>
  )
}

const inputBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: shell.fill,
  border: `1px solid ${line.chromeSoft}`,
  borderRadius: 8,
  padding: '7px 10px',
  color: glass.text,
  fontFamily: fonts.ui,
  fontSize: 13,
  lineHeight: 1.4,
}

export function GlassInput({
  value,
  onChange,
  onCommit,
  placeholder,
  mono = false,
  type = 'text',
  style,
  ariaLabel,
  autoFocus = false,
  min,
  max,
  step,
  disabled = false,
  onEscape,
}: {
  value: string
  onChange: (v: string) => void
  /** Enter or blur. */
  onCommit?: (v: string) => void
  placeholder?: string
  mono?: boolean
  type?: 'text' | 'number' | 'url' | 'search'
  style?: CSSProperties
  ariaLabel?: string
  autoFocus?: boolean
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onEscape?: () => void
}) {
  return (
    <input
      className="studio-glass-input"
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onCommit?.(value)
          ;(e.target as HTMLInputElement).blur()
        }
        if (e.key === 'Escape') {
          onEscape?.()
          ;(e.target as HTMLInputElement).blur()
        }
        e.stopPropagation()
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      min={min}
      max={max}
      step={step}
      style={{ ...inputBase, ...(mono ? { fontFamily: fonts.mono, fontSize: 12, fontVariantNumeric: 'tabular-nums' } : null), ...style }}
    />
  )
}

export function GlassTextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  style,
  ariaLabel,
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  style?: CSSProperties
  ariaLabel?: string
  autoFocus?: boolean
}) {
  return (
    <textarea
      className="studio-glass-input"
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      aria-label={ariaLabel}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      style={{ ...inputBase, resize: 'vertical', ...style }}
    />
  )
}

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, backgroundColor: shell.fill, border: `1px solid ${line.chromeSoft}` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          style={{
            ...canvasType.label,
            color: o.value === value ? glass.text : glass.muted,
            backgroundColor: o.value === value ? glass.rowActive : 'transparent',
            border: 'none',
            borderRadius: 6,
            padding: '5px 8px',
            cursor: 'pointer',
            transition: `background-color ${motionSpec.hoverMs}ms ease, color ${motionSpec.hoverMs}ms ease`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The 48 px rail (left or right dock), 16 px inset from the stage's corner. */
export function Rail({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <Panel
      width={geometry.railW}
      style={{
        position: 'absolute',
        top: geometry.topBarH + 16,
        [side]: 16,
        zIndex: zIndex.chrome,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '6px 0',
      }}
    >
      {children}
    </Panel>
  )
}

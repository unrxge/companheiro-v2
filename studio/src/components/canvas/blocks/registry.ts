// studio/src/components/canvas/blocks/registry.ts — the component registry (lane A).
// Lanes C (text), D (rich) and E (media) register one entry per block type from
// their register.ts; the stage dispatches through getRegistration(type) and
// falls back to FallbackBlock for anything unregistered. Pure module state, no React
// rendering here.

import type { ComponentType } from 'react'
import type { AnyBlock, BlockType } from '@/lib/studio/types'

/** The row for one type; for the whole union it is AnyBlock so `block.type === 'update'` narrows. */
export type BlockOf<T extends BlockType> = Extract<AnyBlock, { type: T }>

export interface BlockRendererProps<T extends BlockType = BlockType> {
  block: BlockOf<T>
  /** This block is in in-place editing (store.editing === block.id). */
  editing: boolean
  selected: boolean
  /** Phone view: no hover, no editing, tap opens the sheet. */
  phone: boolean
}

export interface BlockSettingsProps<T extends BlockType = BlockType> {
  block: BlockOf<T>
}

export interface BlockSheetProps<T extends BlockType = BlockType> {
  block: BlockOf<T>
}

/**
 * How the shell draws the eyebrow row (6.2):
 *  - 'shell'  → the shell renders `TYPE · DATE (· FROM TALK)` itself (default for paper blocks)
 *  - 'none'   → the renderer owns the first row (default for paperless and media)
 *  - function → the shell renders the string it returns (mono uppercase)
 */
export type EyebrowMode = 'shell' | 'none' | ((block: AnyBlock) => string | null)

export interface BlockRegistration<T extends BlockType = BlockType> {
  Renderer: ComponentType<BlockRendererProps<T>>
  /** Right-dock settings for the type (rendered after the common fields). */
  Settings?: ComponentType<BlockSettingsProps<T>>
  /** Phone bottom sheet with the expanded readable content. */
  Sheet?: ComponentType<BlockSheetProps<T>>
  eyebrow?: EyebrowMode
}

const registrations = new Map<BlockType, BlockRegistration>()

export function registerBlock<T extends BlockType>(type: T, reg: BlockRegistration<T>): void {
  registrations.set(type, reg as unknown as BlockRegistration)
}

export function getRegistration(type: BlockType): BlockRegistration | undefined {
  return registrations.get(type)
}

export function getRenderer(type: BlockType): ComponentType<BlockRendererProps> | undefined {
  return registrations.get(type)?.Renderer
}

export function isRegistered(type: BlockType): boolean {
  return registrations.has(type)
}

/** Test/HMR helper: forget every registration. */
export function clearRegistrations(): void {
  registrations.clear()
}

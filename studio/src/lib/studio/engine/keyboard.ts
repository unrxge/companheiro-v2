// studio/src/lib/studio/engine/keyboard.ts — the global key map (5.11, D-041).
// Every key dispatches an action that already exists; nothing here knows how to
// change the canvas itself. Typing always wins: while a field has focus only Esc
// is read, and inside a textarea the browser's own undo is left alone.

import type { CanvasActions } from '@/components/canvas/actions'
import type { CanvasStore } from '@/lib/studio/store'
import type { PointerMachine } from '@/lib/studio/engine/pointer'
import { ZOOM_STEP } from '@/lib/studio/engine/viewport'

export interface KeyboardEnv {
  store: CanvasStore
  actions: CanvasActions
  machine: PointerMachine
  /** The one-per-project surfaces the keys reach. */
  openTalk(): void
  openLibrary(search: boolean): void
  toggleKeyMap(): void
  setSetting(key: 'snap' | 'grid' | 'sizes', v: boolean): void
  closeDrawer(): boolean
}

const isTyping = (): boolean => {
  const el = typeof document === 'undefined' ? null : document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function installKeyboard(env: KeyboardEnv): () => void {
  const { store, actions, machine } = env

  const selected = (): string[] => [...store.get().selection]

  const onKeyDown = (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey
    const s = store.get()

    // Esc is the one key that reaches through a focused field
    if (e.key === 'Escape') {
      if (machine.mode() === 'linking' || machine.mode() === 'placing' || machine.mode() === 'marquee') {
        machine.exitMode()
      } else if (s.editing) {
        machine.exitEdit(true)
      } else if (s.selection.size > 0) {
        actions.select([])
      } else {
        env.closeDrawer()
      }
      e.preventDefault()
      return
    }

    if (isTyping()) return
    machine.keydown(e)

    // talk is reachable at any time, selection or not
    if (meta && e.key.toLowerCase() === 'k') {
      env.openTalk()
      e.preventDefault()
      return
    }

    if (meta) {
      const k = e.key.toLowerCase()
      if (k === 'z') {
        if (e.shiftKey) actions.redo()
        else actions.undo()
        e.preventDefault()
        return
      }
      if (k === 'y') { actions.redo(); e.preventDefault(); return }
      if (k === 'a') { actions.select(store.topLevel().map((b) => b.id)); e.preventDefault(); return }
      if (k === 'd') { actions.duplicate(selected()); e.preventDefault(); return }
      if (e.key === ']') { actions.stepZ(selected(), e.shiftKey ? 'front' : 'forward'); e.preventDefault(); return }
      if (e.key === '[') { actions.stepZ(selected(), e.shiftKey ? 'back_all' : 'back'); e.preventDefault(); return }
      if (e.shiftKey && k === 'h') {
        const ids = selected()
        const anyShown = ids.some((id) => !store.get().blocks.get(id)?.hidden)
        actions.hide(ids, anyShown)
        e.preventDefault()
        return
      }
      if (e.shiftKey && k === 'l') {
        const ids = selected()
        const anyOpen = ids.some((id) => !store.get().blocks.get(id)?.locked)
        actions.lock(ids, anyOpen)
        e.preventDefault()
        return
      }
      return
    }

    if (!s.interactive) {
      // read-only surfaces still zoom and fit
      if (e.key === '1') { actions.fitAll(); e.preventDefault() }
      if (e.key === '0') { actions.zoomTo(1); e.preventDefault() }
      if (e.key === '+' || e.key === '=') { actions.zoomBy(ZOOM_STEP); e.preventDefault() }
      if (e.key === '-' || e.key === '_') { actions.zoomBy(1 / ZOOM_STEP); e.preventDefault() }
      return
    }

    switch (e.key) {
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        const ids = selected()
        if (ids.length === 0) return
        const step = e.shiftKey ? 40 : 8
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        actions.nudge(ids, dx, dy)
        e.preventDefault()
        return
      }
      case 'Delete': case 'Backspace': {
        const ids = selected()
        if (ids.length) actions.softDelete(ids)
        e.preventDefault()
        return
      }
      case 'Enter': {
        const ids = selected()
        if (ids.length === 1) actions.enterOrOpen(ids[0])
        e.preventDefault()
        return
      }
      case '1':
        if (e.shiftKey) actions.fitIds(selected())
        else actions.fitAll()
        e.preventDefault()
        return
      case '!':                                  // shift+1 on most layouts
        actions.fitIds(selected())
        e.preventDefault()
        return
      case '0': actions.zoomTo(1); e.preventDefault(); return
      case '+': case '=': actions.zoomBy(ZOOM_STEP); e.preventDefault(); return
      case '-': case '_': actions.zoomBy(1 / ZOOM_STEP); e.preventDefault(); return
      case '/': env.openLibrary(true); e.preventDefault(); return
      case '?': env.toggleKeyMap(); e.preventDefault(); return
    }

    switch (e.key.toLowerCase()) {
      case 's': env.setSetting('snap', !s.project.settings.snap); e.preventDefault(); return
      case 'x': env.setSetting('sizes', !s.project.settings.sizes); e.preventDefault(); return
      case 'g': env.setSetting('grid', !s.project.settings.grid); e.preventDefault(); return
      case 't': actions.tidy(e.shiftKey); e.preventDefault(); return
      case 'l': actions.enterLink(); e.preventDefault(); return
      case 'f': {
        const ids = selected()
        if (ids.length) actions.frameSelection(ids)
        e.preventDefault()
        return
      }
    }
  }

  const onKeyUp = (e: KeyboardEvent) => machine.keyup(e)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }
}

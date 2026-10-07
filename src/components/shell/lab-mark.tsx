import { shell } from '@/lib/design-tokens'

// Same width at which the Dock leaves the bottom of the screen for the top
// (DOCK_DESKTOP_MIN in dock.tsx). Below it the bottom edge belongs to the Dock.
const LABEL_MIN = 720

const OCHRE = '#bf8a30'

/**
 * Marks every page of a lab deployment, so the lab is never mistaken for the
 * live app (same look, different database): a thin ochre line along the top
 * edge at every size, and a small corner label where there is room for one.
 * Never rendered on companheiro.app. Sits under dialogs and lets clicks through.
 */
export function LabMark() {
  return (
    <div aria-hidden>
      <style>{`
        .lab-line { position: fixed; top: 0; left: 0; right: 0; height: 2px; z-index: 40; pointer-events: none; background-color: ${OCHRE}; opacity: 0.85; }
        .lab-label { display: none; position: fixed; right: calc(10px + env(safe-area-inset-right)); bottom: calc(10px + env(safe-area-inset-bottom)); z-index: 40; pointer-events: none; padding: 3px 9px; border-radius: 999px; border: 1px solid ${shell.line}; background-color: rgba(13, 12, 11, 0.72); color: ${OCHRE}; font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; }
        @media (min-width: ${LABEL_MIN}px) { .lab-label { display: block; } }
      `}</style>
      <div className="lab-line" />
      <div className="lab-label">Lab</div>
    </div>
  )
}

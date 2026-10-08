/**
 * A banner across the top of every page of a lab deployment, so the lab is
 * never mistaken for the live app (same look, different database). Never
 * rendered on companheiro.app. Sits under dialogs and lets clicks through;
 * the page is pushed down by its height so nothing hides beneath it, and on
 * wide screens the Dock moves down with it (720 = DOCK_DESKTOP_MIN in dock.tsx).
 */
const HEIGHT = 26
const OCHRE = '#bf8a30'

export function LabMark() {
  return (
    <>
      <style>{`
        body { padding-top: ${HEIGHT}px; }
        .lab-banner { position: fixed; top: 0; left: 0; right: 0; height: calc(${HEIGHT}px + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); z-index: 70; pointer-events: none; display: flex; align-items: center; justify-content: center; gap: 8px; background-color: ${OCHRE}; color: #1a1408; font-family: var(--font-geist-sans), system-ui, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; }
        @media (min-width: 720px) { .dock { top: ${14 + HEIGHT}px !important; } }
        .lab-banner span { font-weight: 400; opacity: 0.8; }
      `}</style>
      <div className="lab-banner" role="note" aria-label="Test lab">
        TEST LAB <span>· a copy for trying things — not the live app</span>
      </div>
    </>
  )
}

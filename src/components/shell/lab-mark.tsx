import { LabWaiting } from './lab-waiting'

/**
 * A banner across the top of every page of a lab deployment, so the lab is
 * never mistaken for the live app (same look, different database). Never
 * rendered on companheiro.app. Sits under dialogs and lets clicks through,
 * except for its one control: the list of what is in the lab and not yet
 * live. The page is pushed down by its height so nothing hides beneath it, and
 * on wide screens the Dock moves down with it (720 = DOCK_DESKTOP_MIN in dock.tsx).
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
        .lab-banner > span { font-weight: 400; opacity: 0.8; }
        @media (max-width: 719px) { .lab-banner > span { display: none; } }
        .lab-waiting { position: relative; pointer-events: auto; margin-left: 6px; }
        .lab-waiting-button { font: inherit; font-weight: 600; letter-spacing: 0.02em; color: #1a1408; background: rgba(26, 20, 8, 0.14); border: 1px solid rgba(26, 20, 8, 0.3); border-radius: 999px; padding: 1px 9px; cursor: pointer; white-space: nowrap; }
        .lab-waiting-button:hover { background: rgba(26, 20, 8, 0.24); }
        .lab-waiting-list { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: min(420px, calc(100vw - 24px)); max-height: 60vh; overflow-y: auto; background: #171512; color: #ece9e2; border: 1px solid rgba(236, 233, 226, 0.14); border-radius: 12px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5); padding: 12px 14px; font-weight: 400; letter-spacing: 0; text-align: left; }
        @media (max-width: 719px) { .lab-waiting-list { position: fixed; top: calc(${HEIGHT + 8}px + env(safe-area-inset-top)); left: 12px; right: 12px; transform: none; width: auto; } }
        .lab-waiting-head { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a857c; margin: 0 0 8px; }
        .lab-waiting-note { font-size: 13px; margin: 0; color: #ece9e2; }
        .lab-waiting-list ul { list-style: none; margin: 0; padding: 0; }
        .lab-waiting-list li { padding: 8px 0; border-top: 1px solid rgba(236, 233, 226, 0.1); display: flex; flex-direction: column; gap: 2px; }
        .lab-waiting-list li:first-child { border-top: 0; padding-top: 0; }
        .lab-waiting-title { font-size: 13px; line-height: 1.35; }
        .lab-waiting-when { font-size: 11px; color: #8a857c; }
      `}</style>
      <div className="lab-banner" role="note" aria-label="Test lab">
        TEST LAB <span>· a copy for trying things — not the live app</span>
        <LabWaiting />
      </div>
    </>
  )
}

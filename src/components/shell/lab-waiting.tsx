'use client'

import { useEffect, useRef, useState } from 'react'

interface Waiting { id: string; title: string; at: string | null }

const when = (at: string | null) =>
  at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

/**
 * The lab banner's list of what is in the lab and not yet in the live app.
 * Asked once when the page opens (for the count) and again each time the
 * list is opened.
 */
export function LabWaiting() {
  const [open, setOpen] = useState(false)
  const [waiting, setWaiting] = useState<Waiting[] | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = () => {
    fetch('/api/lab/waiting')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { waiting: Waiting[] }) => { setWaiting(d.waiting); setFailed(false) })
      .catch(() => setFailed(true))
  }
  useEffect(load, [])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const count = waiting?.length
  return (
    <div ref={box} className="lab-waiting">
      <button
        type="button"
        className="lab-waiting-button"
        aria-expanded={open}
        onClick={() => { if (!open) load(); setOpen(!open) }}
      >
        {count == null ? 'Not yet live' : count === 0 ? 'Nothing waiting' : `${count} not yet live`} <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="lab-waiting-list" role="dialog" aria-label="Changes in the lab that are not yet in the live app">
          <p className="lab-waiting-head">In the lab, not yet in the live app</p>
          {failed && <p className="lab-waiting-note">Couldn’t fetch the list just now. Try again in a minute.</p>}
          {!failed && waiting == null && <p className="lab-waiting-note">Looking…</p>}
          {!failed && count === 0 && <p className="lab-waiting-note">Nothing. The live app has everything the lab has.</p>}
          {!failed && !!count && (
            <ul>
              {waiting!.map((c) => (
                <li key={c.id}>
                  <span className="lab-waiting-title">{c.title}</span>
                  <span className="lab-waiting-when">{when(c.at)} · {c.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

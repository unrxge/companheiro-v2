'use client'

// Where a new account came from, carried in the URL rather than a cookie or
// browser storage: the landing page forwards whatever it arrived with onto
// its signup links, and the signup form hands it to Supabase as user
// metadata, where a trigger (migration 026) files it. Nothing is stored in
// the visitor's browser, so there is nothing to ask consent for.
import { useEffect, useState } from 'react'

const FORWARDED = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'via', 'landing'] as const

export interface Attribution {
  source?: string
  medium?: string
  campaign?: string
  ref?: string
  via?: string
  landing?: string
  heard_from?: string
}

// The referring site's host, when it's somewhere other than here.
function externalReferrer(): string | null {
  try {
    if (!document.referrer) return null
    const host = new URL(document.referrer).hostname.replace(/^www\./, '')
    return host && host !== window.location.hostname.replace(/^www\./, '') ? host : null
  } catch {
    return null
  }
}

/** `href` plus whatever attribution this page was reached with. */
export function useAttributedHref(href: string): string {
  const [out, setOut] = useState(href)
  useEffect(() => {
    const here = new URLSearchParams(window.location.search)
    const next = new URLSearchParams()
    for (const k of FORWARDED) {
      const v = here.get(k)
      if (v) next.set(k, v.slice(0, 120))
    }
    if (!next.has('via')) {
      const via = externalReferrer()
      if (via) next.set('via', via)
    }
    if (!next.has('landing') && next.size > 0) next.set('landing', window.location.pathname)
    const q = next.toString()
    setOut(q ? `${href}?${q}` : href)
  }, [href])
  return out
}

/** Read on the signup page: what the URL carries, plus the referrer if they arrived here directly. */
export function readAttribution(): Attribution {
  const q = new URLSearchParams(window.location.search)
  const a: Attribution = {
    source: q.get('utm_source') ?? undefined,
    medium: q.get('utm_medium') ?? undefined,
    campaign: q.get('utm_campaign') ?? undefined,
    ref: q.get('ref') ?? undefined,
    via: q.get('via') ?? externalReferrer() ?? undefined,
    landing: q.get('landing') ?? undefined,
  }
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v)) as Attribution
}

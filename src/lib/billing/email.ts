import { isDisposableEmailDomain } from 'disposable-email-domains-js'

// Mirrors normalized_email_hash() in migration 025 — keep them in step.
// Lowercase, drop any +tag, and for Gmail drop dots and fold googlemail.com
// in, so every spelling of one inbox counts as one address.
export function normaliseEmail(email: string): string | null {
  const addr = email.trim().toLowerCase()
  const at = addr.indexOf('@')
  if (at <= 0) return null
  let local = addr.slice(0, at).split('+')[0]
  let domain = addr.slice(at + 1)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '')
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  return !!domain && isDisposableEmailDomain(domain)
}

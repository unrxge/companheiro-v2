// Client-side settings cache. The source of truth is `user_settings` in the
// database (via /api/settings); these helpers keep a localStorage mirror so
// things like dictation language are available synchronously.

export interface UserSettings {
  dictation_lang: string | null
  sunday_letter: boolean
  onboarded_at: string | null
}

export const DICTATION_LANG_KEY = 'companheiro-dictation-lang'

/** BCP-47 tag for speech recognition: explicit setting, else the browser's language. */
export function getDictationLang(): string {
  if (typeof window === 'undefined') return 'en-US'
  try {
    const stored = window.localStorage.getItem(DICTATION_LANG_KEY)
    if (stored) return stored
  } catch {
    /* ignore */
  }
  return navigator.language || 'en-US'
}

export function setDictationLangCache(lang: string | null) {
  try {
    if (lang) window.localStorage.setItem(DICTATION_LANG_KEY, lang)
    else window.localStorage.removeItem(DICTATION_LANG_KEY)
  } catch {
    /* ignore */
  }
}

/** Languages offered in Settings. Speech recognition needs a regional tag. */
export const DICTATION_LANGS: { tag: string; label: string }[] = [
  { tag: 'pt-PT', label: 'Português (Portugal)' },
  { tag: 'pt-BR', label: 'Português (Brasil)' },
  { tag: 'en-GB', label: 'English (UK)' },
  { tag: 'en-US', label: 'English (US)' },
  { tag: 'es-ES', label: 'Español' },
  { tag: 'fr-FR', label: 'Français' },
  { tag: 'de-DE', label: 'Deutsch' },
  { tag: 'it-IT', label: 'Italiano' },
  { tag: 'nl-NL', label: 'Nederlands' },
]

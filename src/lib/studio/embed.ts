// What a link on the canvas can show inside Companheiro. A video, a song or a
// picture from a known place is played or shown where it is; anything else
// opens in a new tab. Pure, so it is tested on its own.

export type EmbedKind = 'video' | 'audio' | 'image' | 'page'

export interface Embed {
  kind: EmbedKind
  /** Where it plays: an iframe's address, or the file itself for `media`. */
  src: string | null
  /** Played by the browser's own <video>, <audio> or <img>, not an iframe. */
  media: boolean
  /** A still to show on the card before it is opened, when one is known. */
  thumb: string | null
  /** Where it came from, as a person would say it: "youtube.com". */
  host: string
  /** Width over height, for the player. */
  ratio: number
}

/** The address as given, made safe: http(s) only, with the scheme filled in. Null when it is not a link. */
export function cleanUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v || /\s/.test(v)) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString().slice(0, 2000)
  } catch {
    return null
  }
}

const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)$/i
const AUDIO_FILE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg)$/i

export function embedFor(url: string): Embed {
  let u: URL
  try { u = new URL(url) } catch { return { kind: 'page', src: null, media: false, thumb: null, host: '', ratio: 16 / 9 } }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  const page = { kind: 'page' as const, src: null, media: false, thumb: null, host, ratio: 16 / 9 }
  const path = u.pathname

  // YouTube: watch, youtu.be, shorts, embed, live
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be'
      ? path.slice(1).split('/')[0]
      : u.searchParams.get('v') ?? /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(path)?.[1] ?? null
    if (id && /^[\w-]{6,}$/.test(id)) {
      const t = u.searchParams.get('t') ?? u.searchParams.get('start')
      const start = t ? parseInt(t, 10) : 0
      const short = path.startsWith('/shorts/')
      return {
        kind: 'video', media: false, host,
        src: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start > 0 ? `&start=${start}` : ''}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        ratio: short ? 9 / 16 : 16 / 9,
      }
    }
    return page
  }
  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /\/(?:video\/)?(\d{5,})/.exec(path)?.[1]
    if (id) return { kind: 'video', media: false, host, src: `https://player.vimeo.com/video/${id}`, thumb: null, ratio: 16 / 9 }
    return page
  }
  // Loom
  if (host === 'loom.com') {
    const id = /\/(?:share|embed)\/([\da-f]{16,})/i.exec(path)?.[1]
    if (id) return { kind: 'video', media: false, host, src: `https://www.loom.com/embed/${id}`, thumb: null, ratio: 16 / 9 }
    return page
  }
  // Spotify: tracks, albums, playlists, episodes, shows, artists
  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/([\w]+)/.exec(path)
    if (m) return { kind: 'audio', media: false, host, src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, thumb: null, ratio: m[1] === 'track' || m[1] === 'episode' ? 4 : 1.2 }
    return page
  }
  // SoundCloud
  if (host === 'soundcloud.com' && path.split('/').filter(Boolean).length >= 2) {
    return { kind: 'audio', media: false, host, src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&visual=false&show_comments=false`, thumb: null, ratio: 4 }
  }
  // Bandcamp pages don't embed by their address; they open in a tab.
  // A file itself
  if (VIDEO_FILE.test(path)) return { kind: 'video', media: true, host, src: url, thumb: null, ratio: 16 / 9 }
  if (AUDIO_FILE.test(path)) return { kind: 'audio', media: true, host, src: url, thumb: null, ratio: 6 }
  if (IMAGE_FILE.test(path)) return { kind: 'image', media: true, host, src: url, thumb: url, ratio: 4 / 3 }
  return page
}

// Extracts as much real signal as possible from a shared link so captures
// interpret the actual content, not the URL string. Strategy:
//   1. oEmbed for platforms with open endpoints (YouTube, TikTok, X, Vimeo)
//   2. OG-tag scrape with a crawler UA that social platforms serve previews to
//   3. Thumbnail download (base64) so Claude can visually read the content
// Video itself is unreachable (login walls, and Claude takes no video input) —
// caption + thumbnail is the honest ceiling and usually carries the idea.

const FETCH_TIMEOUT_MS = 5000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number]

export interface LinkContent {
  platform: string | null
  title: string | null
  description: string | null
  author: string | null
  imageBase64: string | null
  imageMediaType: ImageMediaType | null
}

interface OEmbedProvider {
  match: RegExp
  platform: string
  endpoint: (url: string) => string
}

const OEMBED_PROVIDERS: OEmbedProvider[] = [
  {
    match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
    platform: 'YouTube',
    endpoint: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  },
  {
    match: /(^|\.)tiktok\.com$/,
    platform: 'TikTok',
    endpoint: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)twitter\.com$|(^|\.)x\.com$/,
    platform: 'X',
    endpoint: (u) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(u)}&omit_script=1`,
  },
  {
    match: /(^|\.)vimeo\.com$/,
    platform: 'Vimeo',
    endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
  },
]

const KNOWN_PLATFORMS: Array<{ match: RegExp; name: string }> = [
  { match: /(^|\.)instagram\.com$/, name: 'Instagram' },
  { match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, name: 'YouTube' },
  { match: /(^|\.)tiktok\.com$/, name: 'TikTok' },
  { match: /(^|\.)twitter\.com$|(^|\.)x\.com$/, name: 'X' },
  { match: /(^|\.)vimeo\.com$/, name: 'Vimeo' },
  { match: /(^|\.)substack\.com$/, name: 'Substack' },
  { match: /(^|\.)linkedin\.com$/, name: 'LinkedIn' },
]

function safeUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0' ||
    host === '[::1]'
  ) {
    return null
  }
  return url
}

async function timedFetch(url: string, headers: Record<string, string>): Promise<Response | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, { signal: controller.signal, headers, redirect: 'follow' })
    clearTimeout(timeout)
    return res.ok ? res : null
  } catch {
    return null
  }
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
}

function extractMeta(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1].trim()).slice(0, 600)
  }
  return null
}

interface OEmbedResult {
  platform: string
  title: string | null
  author: string | null
  text: string | null
  thumbnailUrl: string | null
}

async function tryOEmbed(url: URL): Promise<OEmbedResult | null> {
  const provider = OEMBED_PROVIDERS.find((p) => p.match.test(url.hostname.toLowerCase()))
  if (!provider) return null

  const res = await timedFetch(provider.endpoint(url.toString()), {
    Accept: 'application/json',
  })
  if (!res) return null

  try {
    const data = await res.json()
    return {
      platform: provider.platform,
      title: data.title?.slice(0, 600) || null,
      author: data.author_name || null,
      // X puts the full tweet text inside the embed html
      text: data.html ? stripHtml(data.html).slice(0, 600) : null,
      thumbnailUrl: data.thumbnail_url || null,
    }
  } catch {
    return null
  }
}

interface OgResult {
  title: string | null
  description: string | null
  siteName: string | null
  imageUrl: string | null
}

async function tryOgTags(url: URL): Promise<OgResult | null> {
  // Social platforms serve OG previews to link-preview crawlers, not generic bots
  const res = await timedFetch(url.toString(), {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    Accept: 'text/html',
  })
  if (!res) return null

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return null

  const html = (await res.text()).slice(0, 150_000)

  const title = extractMeta(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ])
  const description = extractMeta(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ])
  const siteName = extractMeta(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
  ])
  const imageUrl = extractMeta(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ])

  if (!title && !description && !imageUrl) return null
  return { title, description, siteName, imageUrl }
}

async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: ImageMediaType } | null> {
  const url = safeUrl(imageUrl)
  if (!url) return null

  const res = await timedFetch(url.toString(), { Accept: 'image/*' })
  if (!res) return null

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
  if (!IMAGE_MEDIA_TYPES.includes(contentType as ImageMediaType)) return null

  const buffer = await res.arrayBuffer()
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null

  return {
    base64: Buffer.from(buffer).toString('base64'),
    mediaType: contentType as ImageMediaType,
  }
}

export async function analyzeLink(rawUrl: string): Promise<LinkContent | null> {
  const url = safeUrl(rawUrl)
  if (!url) return null

  const [oembed, og] = await Promise.all([tryOEmbed(url), tryOgTags(url)])
  if (!oembed && !og) return null

  const platform =
    oembed?.platform ||
    og?.siteName ||
    KNOWN_PLATFORMS.find((p) => p.match.test(url.hostname.toLowerCase()))?.name ||
    null

  const imageUrl = oembed?.thumbnailUrl || og?.imageUrl || null
  const image = imageUrl ? await fetchImageAsBase64(imageUrl) : null

  return {
    platform,
    title: oembed?.title || og?.title || null,
    description: oembed?.text || og?.description || null,
    author: oembed?.author || null,
    imageBase64: image?.base64 || null,
    imageMediaType: image?.mediaType || null,
  }
}

// Fetches a page's title + description so URL captures are grounded in what
// the link actually is, instead of Claude guessing from the URL string.

const FETCH_TIMEOUT_MS = 4000

function isFetchableUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  // Crude SSRF guard: refuse obvious local/private hosts.
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

function extractTag(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return decodeEntities(match[1].trim()).slice(0, 300)
    }
  }
  return null
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export interface UrlMetadata {
  title: string | null
  description: string | null
}

export async function fetchUrlMetadata(rawUrl: string): Promise<UrlMetadata | null> {
  const url = isFetchableUrl(rawUrl)
  if (!url) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        // Some social platforms only serve OG tags to crawler-ish agents
        'User-Agent': 'Mozilla/5.0 (compatible; CompanheiroBot/1.0; +capture-preview)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return null

    // Only need the head — cap the read at 100KB.
    const html = (await res.text()).slice(0, 100_000)

    const title = extractTag(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ])

    const description = extractTag(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ])

    if (!title && !description) return null
    return { title, description }
  } catch {
    // Timeouts, blocked crawlers, dead links — capture proceeds without metadata.
    return null
  }
}

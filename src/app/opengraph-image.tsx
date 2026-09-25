import { ImageResponse } from 'next/og'
import { shell, tokensFor } from '@/lib/design-tokens'

// The link preview shown on social media and in messaging apps. Rendered once
// at build time; it mirrors the landing hero (Geist headline, one word in
// Newsreader italic, ember accent).

export const alt = 'Companheiro — You already have a vision.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const ember = tokensFor('dark').ember

// Fetch only the glyphs we draw, as TTF (Satori cannot read woff2).
async function googleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)
    ).text()
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)
    if (!src) return null
    const res = await fetch(src[1])
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export default async function OpengraphImage() {
  const [geist, geistRegular, newsreader] = await Promise.all([
    googleFont('Geist:wght@700', 'You already have a.'),
    googleFont('Geist:wght@400', 'Companheiro'),
    googleFont('Newsreader:ital@1', 'vision'),
  ])
  const fonts = [
    geist && { name: 'Geist', data: geist, weight: 700 as const, style: 'normal' as const },
    geistRegular && { name: 'Geist', data: geistRegular, weight: 400 as const, style: 'normal' as const },
    newsreader && { name: 'Newsreader', data: newsreader, weight: 400 as const, style: 'italic' as const },
  ].filter((f): f is NonNullable<typeof f> => Boolean(f))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 88px',
          background: `radial-gradient(ellipse at 20% 0%, #2a1a14 0%, ${shell.ink2} 35%, ${shell.ink} 75%)`,
          color: shell.text,
          fontFamily: 'Geist',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="44" height="44" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="none" stroke={shell.text} strokeWidth="1.5" />
            <circle cx="16" cy="15" r="3.5" fill={shell.text} />
          </svg>
          <div style={{ fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}>Companheiro</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            maxWidth: 900,
          }}
        >
          <span>You already have a&nbsp;</span>
          <span style={{ fontFamily: 'Newsreader', fontWeight: 400, fontStyle: 'italic', color: ember, letterSpacing: '-0.01em' }}>
            vision
          </span>
          <span>.</span>
        </div>

        <div style={{ display: 'flex', width: 120, height: 4, borderRadius: 2, background: ember }} />
      </div>
    ),
    { ...size, fonts },
  )
}

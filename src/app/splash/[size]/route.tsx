import { ImageResponse } from 'next/og'
import { atmosphereHues, shell } from '@/lib/design-tokens'
import { SPLASH_SCREENS } from '@/lib/splash'

// The launch screen an iPhone shows while the Home Screen app starts: the
// app's own ink and ember sky with the mark in the middle, so opening it goes
// from this straight into the shell instead of through a white screen.
// One image per screen size (lib/splash.ts), each drawn once at build time.

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return SPLASH_SCREENS.map((s) => ({ size: s.file }))
}

// Fetch only the glyphs we draw, as TTF (Satori cannot read woff2).
async function wordmarkFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Geist:wght@500&text=Companheiro`)).text()
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)
    if (!src) return null
    const res = await fetch(src[1])
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params
  const screen = SPLASH_SCREENS.find((s) => s.file === size)
  if (!screen) return new Response('Not found', { status: 404 })

  const { width, height } = screen
  const [glow] = atmosphereHues.ember
  const mark = Math.round(width * 0.2)
  const font = await wordmarkFont()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          // The shell's ember sky, held still: its glow up and to the left.
          background: `radial-gradient(ellipse at 18% 4%, ${glow} 0%, ${shell.ink2} 42%, ${shell.ink} 78%)`,
          color: shell.text,
          fontFamily: 'Geist',
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="none" stroke={shell.text} strokeWidth="1.5" />
          <circle cx="16" cy="15" r="3.5" fill={shell.text} />
        </svg>
        <div style={{ marginTop: Math.round(width * 0.05), fontSize: Math.round(width * 0.058), fontWeight: 500, letterSpacing: '-0.01em' }}>
          Companheiro
        </div>
      </div>
    ),
    { width, height, fonts: font ? [{ name: 'Geist', data: font, weight: 500, style: 'normal' }] : undefined },
  )
}

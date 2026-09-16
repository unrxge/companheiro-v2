import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Inter } from 'next/font/google'
import './globals.css'
import LangSync from '@/components/LangSync'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

// Geist is the face everywhere; Inter is design-tokens.ts's own fallback
// before system-ui (fonts.display/fonts.ui) — pinned here the same way the
// main app pins it, so that fallback is a loaded webfont, not whatever (if
// anything) the OS happens to have installed under that name.
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d0c0b',
}

export const metadata: Metadata = {
  title: 'Companheiro · studio',
  description: 'Projects you make, projects you direct.',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Companheiro' },
  formatDetection: { telephone: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col">
        <LangSync />
        <ThemeProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

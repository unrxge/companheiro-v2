import { NextResponse, type NextRequest } from 'next/server'

// Check for a Supabase session cookie without making any network calls or
// using Node.js APIs. Full session validation happens in server components
// and route handlers which run on Node.js. This lightweight check is safe
// for the Edge Runtime that Next.js middleware uses by default.
function hasSessionCookie(request: NextRequest): boolean {
  // A long session is split across numbered cookies (sb-…-auth-token.0, .1),
  // so the name may end in a chunk number.
  return request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
}

const LEGAL_PATHS = new Set(['/terms', '/privacy', '/cookies', '/refunds', '/accessibility', '/legal'])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  // /reset is reachable both ways: unauthenticated to request a link, and
  // authenticated (via the recovery session) to set the new password.
  // /confirm is where a sign-up email's button lands, before there is a session.
  const isResetPage = pathname === '/reset' || pathname === '/confirm'
  // `/` is the public landing page when signed out. It is a static page (so
  // it can be served from the CDN), which means it cannot look at the session
  // itself: signed-in visitors are sent on to /home from here.
  const isLanding = pathname === '/'
  // Legal pages must be readable before anyone signs up.
  const isLegal = LEGAL_PATHS.has(pathname)
  const isAuthenticated = hasSessionCookie(request)

  if (!isAuthenticated && !isAuthPage && !isResetPage && !isLanding && !isLegal) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthenticated && (isAuthPage || isLanding)) {
    const appUrl = request.nextUrl.clone()
    appUrl.pathname = '/home'
    return NextResponse.redirect(appUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, manifest.json, sitemap.xml, robots.txt, opengraph-image (link previews)
     * - public image assets
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico|manifest\\.json|sitemap\\.xml|robots\\.txt|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

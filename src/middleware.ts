import { NextResponse, type NextRequest } from 'next/server'

// Check for a Supabase session cookie without making any network calls or
// using Node.js APIs. Full session validation happens in server components
// and route handlers which run on Node.js. This lightweight check is safe
// for the Edge Runtime that Next.js middleware uses by default.
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) =>
    name.startsWith('sb-') && name.endsWith('-auth-token')
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isAuthenticated = hasSessionCookie(request)

  if (!isAuthenticated && !isLoginPage) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthenticated && isLoginPage) {
    const appUrl = request.nextUrl.clone()
    appUrl.pathname = '/check-in'
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
     * - favicon.ico, sitemap.xml, robots.txt
     * - public image assets
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

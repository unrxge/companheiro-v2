import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

// Cookie-wired Supabase client for route handlers. Untyped on purpose:
// the generated Database types lag behind migrations and would break
// routes that query newer tables.
export async function createRouteClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            console.error('Error setting cookies:', error)
          }
        },
      },
    }
  )
}

export type AuthedContext = {
  supabase: Awaited<ReturnType<typeof createRouteClient>>
  user: User
}

// Returns the client + verified user, or null if unauthenticated.
// Middleware does not cover /api, so every route must call this.
export async function requireUser(): Promise<AuthedContext | null> {
  const supabase = await createRouteClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return { supabase, user }
}

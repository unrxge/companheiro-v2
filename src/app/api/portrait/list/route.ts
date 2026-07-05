import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getActivePortrait } from '@/lib/portrait'

export async function GET(): Promise<NextResponse<{ entries: Awaited<ReturnType<typeof getActivePortrait>> }>> {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ entries: [] }, { status: 401 })
    }

    const entries = await getActivePortrait(auth)
    return NextResponse.json({ entries })
  } catch (error) {
    console.error('portrait list error:', error)
    return NextResponse.json({ entries: [] }, { status: 500 })
  }
}

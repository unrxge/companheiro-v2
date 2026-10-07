import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getActivePortrait, checkInDatesForEntries, type PortraitEntry } from '@/lib/portrait'

export async function GET(): Promise<NextResponse<{ entries: Array<PortraitEntry & { seen_in?: string[] }> }>> {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ entries: [] }, { status: 401 })
    }

    const entries = await getActivePortrait(auth)
    const seen = await checkInDatesForEntries(auth, entries.map((e) => e.id))
    return NextResponse.json({ entries: entries.map((e) => ({ ...e, seen_in: seen[e.id] ?? [] })) })
  } catch (error) {
    console.error('portrait list error:', error)
    return NextResponse.json({ entries: [] }, { status: 500 })
  }
}

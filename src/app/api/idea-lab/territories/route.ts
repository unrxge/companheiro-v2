import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

type TerritorySlot =
  | { type: 'predefined'; key: string }
  | { type: 'custom'; key: string; label: string; rangeMap?: string; facetSeeds?: string[] }
  | null

const DEFAULT_SLOTS: TerritorySlot[] = [
  { type: 'predefined', key: 'creativity_devotion_curiosity' },
  { type: 'predefined', key: 'healthy_masculinity_emotional_regulation' },
  { type: 'predefined', key: 'inner_child_tending_expression' },
  { type: 'predefined', key: 'slow_living_life_in_service' },
]

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ slots: DEFAULT_SLOTS }, { status: 401 })

    const { supabase, user } = auth

    const { data } = await supabase
      .from('user_territory_config')
      .select('slots')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({ slots: data?.slots ?? DEFAULT_SLOTS })
  } catch (error) {
    console.error('territories GET error:', error)
    return NextResponse.json({ slots: DEFAULT_SLOTS }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })

    const body: { slots: TerritorySlot[] } = await request.json()
    if (!Array.isArray(body.slots) || body.slots.length > 8) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const { supabase, user } = auth

    const { error } = await supabase
      .from('user_territory_config')
      .upsert(
        { user_id: user.id, slots: body.slots, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('territories upsert error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('territories PUT error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

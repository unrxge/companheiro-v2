import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { aiGate } from '@/lib/billing/fair-use'
import { makesFrom, mapTerritory, type TerritoryMap } from '@/lib/territory-map'

// A field's map is written by the deep model and runs long.
export const maxDuration = 60

/**
 * POST { label, otherThemes?, keepInnerMap? } → { register, rangeMap?, facetSeeds? }
 *
 * Sorts a theme into its register and writes its map (lib/territory-map.ts).
 * `keepInnerMap` is sent for a territory that already has a map but no
 * register: an inner theme then keeps its map and only the register comes back.
 */
export async function POST(request: NextRequest): Promise<NextResponse<TerritoryMap | { error: string }>> {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const body = (await request.json()) as { label?: unknown; otherThemes?: unknown; keepInnerMap?: unknown }
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (label.length < 2) return NextResponse.json({ error: 'Invalid label' }, { status: 400 })
    const otherThemes = (Array.isArray(body.otherThemes) ? body.otherThemes : []).map((t) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 8)

    const result = await mapTerritory(auth, label.slice(0, 80), {
      context: { makes: makesFrom(auth.user), otherThemes },
      keepInnerMap: body.keepInnerMap === true,
    })
    // A new territory with no map at all is a failure; a register alone is a fine answer to keepInnerMap.
    if (!result.rangeMap && body.keepInnerMap !== true) return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('generate-map error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

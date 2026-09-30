// GET /api/idea-lab/materials — the person's own pieces, as short excerpts,
// for picking into "Bring several things". Read only when they open the
// picker; nothing here is read into anything on its own.

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { htmlToPlainText } from '@/lib/rich-text'

export async function GET() {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ pieces: [] }, { status: 401 })
  const { data, error } = await auth.supabase
    .from('studio_nodes')
    .select('id, title, body, core_truth, updated_at')
    .eq('user_id', auth.user.id)
    .is('parent_id', null)
    .order('updated_at', { ascending: false })
    .limit(24)
  if (error) {
    console.error('idea-lab/materials error:', error)
    return NextResponse.json({ pieces: [] }, { status: 500 })
  }
  const pieces = (data ?? [])
    .map((n) => {
      const words = htmlToPlainText(n.body || '').replace(/\s+/g, ' ').trim()
      const excerpt = words ? (words.length > 700 ? `${words.slice(0, 700).replace(/\s+\S*$/, '')}…` : words) : (n.core_truth || '').trim()
      return { id: n.id as string, title: (n.title as string) || 'Untitled', excerpt }
    })
    .filter((p) => p.excerpt)
  return NextResponse.json({ pieces })
}

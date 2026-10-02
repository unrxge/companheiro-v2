import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/billing/stripe'
import { MEDIA_BUCKET } from '@/lib/studio/db'

const TABLES = [
  'check_ins',
  'captures',
  'ideas',
  'pieces',
  'piece_sections',
  'anchor_lines',
  'tasks',
  'session_logs',
  'post_publication_logs',
  'trajectories',
  'portrait_entries',
  'conceptualise_drafts',
  'user_territory_config',
  'user_settings',
  'letters',
  // Studio (shelf, board, writing) — where current work lives.
  'studio_projects',
  'studio_nodes',
  'studio_threads',
  'studio_node_threads',
  'studio_blocks',
  'studio_links',
  'studio_assets',
  'studio_board_items',
  'studio_anchor_lines',
  'studio_tasks',
  'studio_drafts',
  'studio_draft_sections',
  'studio_draft_messages',
  'studio_vision_messages',
  'studio_talk_entries',
  'studio_compass_entries',
  'studio_catches',
  'studio_concept_revisions',
  'studio_rule_checks',
  'studio_post_publication_logs',
  'writing_activity',
  'projects',
] as const

// Records about the account rather than made by the person. Most are not
// readable under RLS, so they are read with the service role, filtered to this
// user. Included because a data access request (UK/EU GDPR art 15) covers them.
const ACCOUNT_TABLES = ['subscriptions', 'signup_attribution', 'ai_usage', 'ai_calls', 'billing_events'] as const

/** GET /api/account — export everything this person owns as one JSON document. */
export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
    }
    const admin = adminClient()
    await Promise.all([
      ...TABLES.map(async (table) => {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id)
        out[table] = error ? { error: error.message } : data
      }),
      ...ACCOUNT_TABLES.map(async (table) => {
        const { data, error } = await (admin ?? supabase).from(table).select('*').eq('user_id', user.id)
        out[table] = error ? { error: error.message } : data
      }),
    ])
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="companheiro-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (error) {
    console.error('account export error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** Every file under the user's folder in the studio media bucket (`{user}/{project}/{file}`). */
async function removeMedia(admin: SupabaseClient, userId: string): Promise<void> {
  const bucket = admin.storage.from(MEDIA_BUCKET)
  const { data: folders, error } = await bucket.list(userId, { limit: 1000 })
  if (error) throw error
  for (const folder of folders ?? []) {
    const prefix = `${userId}/${folder.name}`
    // A folder has no id; a file sitting directly under the user folder does.
    if (folder.id) {
      await bucket.remove([prefix])
      continue
    }
    for (;;) {
      const { data: files, error: listErr } = await bucket.list(prefix, { limit: 1000 })
      if (listErr) throw listErr
      if (!files?.length) break
      const { error: rmErr } = await bucket.remove(files.map((f) => `${prefix}/${f.name}`))
      if (rmErr) throw rmErr
      if (files.length < 1000) break
    }
  }
}

/**
 * DELETE /api/account — delete the account and, through ON DELETE CASCADE,
 * every row that belongs to it. Needs the service-role key server-side.
 *
 * Before the rows go: any live Stripe subscription is cancelled (otherwise a
 * deleted account would keep being charged), and uploaded files are removed
 * from storage (cascade only reaches database rows, not the files).
 */
export async function DELETE() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const admin = adminClient()
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Account deletion is not configured on this server yet.' }, { status: 501 })
    }
    const userId = auth.user.id

    const { data: sub } = await admin
      .from('subscriptions')
      .select('status, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (sub?.stripe_subscription_id && ['active', 'past_due', 'trialing'].includes(sub.status)) {
      try {
        await getStripe().subscriptions.cancel(sub.stripe_subscription_id)
      } catch (err) {
        // Stop here: deleting the account while billing carries on is the worst outcome.
        const code = (err as { code?: string })?.code
        if (code !== 'resource_missing') {
          console.error('account delete: stripe cancel failed:', err)
          return NextResponse.json(
            { success: false, error: 'Could not cancel your subscription, so nothing was deleted. Please cancel it in Manage billing first, or contact us.' },
            { status: 502 }
          )
        }
      }
    }

    try {
      await removeMedia(admin, userId)
    } catch (err) {
      // Not fatal: the rows pointing at these files are about to go, and the
      // files are private to this user id. Logged so they can be swept by hand.
      console.error('account delete: media removal failed for', userId, err)
    }

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) {
      console.error('account delete error:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('account DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

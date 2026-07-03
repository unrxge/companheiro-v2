import { formatDateAsRelative } from './dates'
import type { AuthedContext } from './supabase/route'

interface ContextOptions {
  // Days of check-ins to include (default 7)
  checkInDays?: number
  // Max check-ins (default 5, most recent first)
  checkInLimit?: number
}

// Builds the compact brief the companion carries into every conversation:
// recent check-ins, the agreed trajectory, what's actively being made, and
// open threads from published work. This is what turns isolated Claude
// calls into a companion that remembers the person across surfaces.
export async function buildCompanionContext(
  { supabase, user }: AuthedContext,
  options: ContextOptions = {}
): Promise<string> {
  const { checkInDays = 7, checkInLimit = 5 } = options

  const since = new Date()
  since.setDate(since.getDate() - checkInDays)

  try {
    const [
      { data: checkIns },
      { data: trajectory },
      { data: activePieces },
      { data: postPubLogs },
    ] = await Promise.all([
      supabase
        .from('check_ins')
        .select('raw_entry, energy, inner_weather, arc_texture, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(checkInLimit),
      supabase
        .from('trajectories')
        .select('statement, created_at')
        .eq('user_id', user.id)
        .is('superseded_at', null)
        .maybeSingle(),
      supabase
        .from('pieces')
        .select('title, arc, stage')
        .eq('user_id', user.id)
        .neq('stage', 'posted')
        .neq('stage', 'queued')
        .limit(5),
      supabase
        .from('post_publication_logs')
        .select('unresolved, natural_continuations, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2),
    ])

    const parts: string[] = []

    if (trajectory) {
      parts.push(
        `Agreed creative trajectory (from ${formatDateAsRelative(trajectory.created_at)}): "${trajectory.statement}"`
      )
    }

    if (checkIns && checkIns.length > 0) {
      const lines = checkIns.map(
        (c) =>
          `- ${formatDateAsRelative(c.created_at)}: energy ${c.energy}, weather "${c.inner_weather}", arc ${c.arc_texture}. They said: "${truncate(c.raw_entry, 220)}"`
      )
      parts.push(`Recent check-ins (newest first):\n${lines.join('\n')}`)
    }

    if (activePieces && activePieces.length > 0) {
      parts.push(
        `Actively working on: ${activePieces.map((p) => `"${p.title}" (${p.arc}, ${p.stage})`).join('; ')}`
      )
    }

    if (postPubLogs && postPubLogs.length > 0) {
      const threads = postPubLogs
        .flatMap((log) => [
          log.unresolved ? `unresolved: ${truncate(log.unresolved, 160)}` : null,
          log.natural_continuations?.length
            ? `possible continuations: ${log.natural_continuations.slice(0, 3).join('; ')}`
            : null,
        ])
        .filter(Boolean)
      if (threads.length > 0) {
        parts.push(`Open threads from published work:\n- ${threads.join('\n- ')}`)
      }
    }

    if (parts.length === 0) return ''

    return `WHAT YOU ALREADY KNOW ABOUT THIS PERSON (from living alongside them — draw on it naturally when relevant, never recite it back as a list):\n\n${parts.join('\n\n')}`
  } catch (error) {
    // Context is enrichment, never a dependency — degrade to nothing.
    console.error('companion-context error:', error)
    return ''
  }
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}

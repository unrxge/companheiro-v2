import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/route'

// The Write page is the writing page now (/p/[project]/n/[piece]); this sends an old /write?node_id= link there.
export default async function WritePage({ searchParams }: { searchParams: Promise<{ node_id?: string | string[] }> }) {
  const raw = (await searchParams).node_id
  const nodeId = Array.isArray(raw) ? raw[0] : raw

  const auth = await requireUser()
  if (!auth) redirect('/login')
  if (!nodeId) redirect('/project-board')

  const { data } = await auth.supabase
    .from('studio_nodes')
    .select('project_id')
    .eq('id', nodeId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  redirect(data?.project_id ? `/p/${data.project_id}/n/${nodeId}` : '/project-board')
}

// studio/src/lib/studio/talk/apply.ts — STUB (lane A, 11.1). Lane G replaces
// the body with 8.5 (validateSort, applySort, sweepUnsorted); this export's
// signature stays: the /open route imports it.

import type { AuthedContext } from '@/lib/supabase/route'

/** Sorts + applies person entries left unsorted by a closed tab (D-054). Stub: nothing swept. */
export async function sweepUnsorted(_auth: AuthedContext, _projectId: string): Promise<number> {
  return 0
}

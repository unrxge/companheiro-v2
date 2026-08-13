-- Drought protocol removal: its function was already absorbed into the
-- Living Portrait system (/api/portrait/*) some time ago, but the original
-- table was left behind unused. Nothing in the app reads or writes it.
drop table if exists drought_observations;

-- Portrait entries no longer require explicit confirmation before counting
-- toward the active portrait — per user request, the system's own read is
-- trusted directly rather than gated behind a confirm/reject card. Existing
-- pending entries (proposed before this change, under the old flow) are
-- promoted now so nothing is left stranded with no way to ever become
-- active.
update portrait_entries
  set status = 'active', last_reinforced_at = now()
  where status = 'pending';

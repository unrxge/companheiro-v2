-- Distinguishes tasks that are the act of drafting/writing prose from other
-- "creation" tasks (conceptualizing, research, design, promotion) so the
-- Write page can show only tasks actually about the writing itself.
-- Nullable: existing tasks predate this classification and default to
-- included (see write/page.tsx filter) rather than being hidden.
alter table tasks
  add column is_writing_related boolean;

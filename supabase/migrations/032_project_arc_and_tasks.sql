-- ============================================================================
-- 032_project_arc_and_tasks.sql — closes two schema gaps found while rewiring
-- Idea Lab creation and Write mode onto the node/thread model (Phase 3 of the
-- Project Board -> Studio migration, 2026-09-17):
--
--   1. Idea Lab's Lens (arc + thematic territory) had nowhere to land on
--      studio_projects. Plain text, matching the main app's already-widened
--      pieces.arc/pieces.thematic_territory columns (see
--      supabase/migrations/020_inner_weather_public_launch.sql) — NOT the old
--      closed arc_type/thematic_territory enums.
--
--   2. Studio has no equivalent of the main app's `tasks` table (the
--      creation/execution checklist generateTasks() produces at core-concept
--      save time, shown in Project Board's piece modal and in Write's Tasks
--      tool). studio_rule_checks is a different concept (rule violations, not
--      a todo list) and doesn't substitute for it. studio_tasks mirrors
--      `tasks` exactly, with node_id replacing piece_id, plus the same
--      is_writing_related flag `tasks` carries (migration 012_add_task_
--      writing_flag.sql) — Write mode's task panel filters on it, so leaving
--      it out would silently drop that filter for every task created through
--      the new path.
--
-- A third gap surfaced during the same rewiring, outside the two named above:
-- pieces.short_form_script (the Translate-mode output, read by /read) has no
-- studio_nodes equivalent either. Added here too so Translate -> Read stays
-- whole for node-based work; the type is on studio_nodes because is_locked
-- and the other Write-mode-parity fields (migration 006) already live there,
-- for the same "root piece node" reason.
--
-- Additive throughout, follows the do $$ ... $$ guard style of 006 for the
-- enum creates so this is safe to re-run.
-- ============================================================================

alter table studio_projects add column if not exists arc text;
alter table studio_projects add column if not exists thematic_territory text;

alter table studio_nodes add column if not exists short_form_script text;

do $$ begin
  create type studio_task_type as enum ('creation', 'execution');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type studio_task_status as enum ('pending', 'complete');
exception when duplicate_object then null;
end $$;

create table if not exists studio_tasks (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  project_id          uuid references studio_projects(id) on delete cascade not null,
  node_id             uuid references studio_nodes(id) on delete cascade not null,
  title               text not null,
  type                studio_task_type not null,
  status              studio_task_status not null default 'pending',
  is_writing_related  boolean,
  "order"             integer not null default 0,
  created_at          timestamptz default now()
);
alter table studio_tasks enable row level security;
do $$ begin
  create policy "Users can only access their own studio_tasks"
    on studio_tasks for all using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
create index if not exists studio_tasks_node_idx on studio_tasks (node_id, "order");

-- ── rollback (reverse order; kept for the record) ───────────────────────────
-- drop table studio_tasks;
-- drop type studio_task_status, studio_task_type;
-- alter table studio_nodes drop column short_form_script;
-- alter table studio_projects drop column thematic_territory, drop column arc;

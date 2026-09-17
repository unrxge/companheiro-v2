-- ============================================================================
-- 006_shelf_stage_and_writing_fields.sql — the shelf's queue/active/completed
-- lane, and the fields Write mode's Gather/Shape/Test steps need once pieces
-- move onto studio_nodes.
--
-- shelf_stage mirrors the main app's pieces.stage queue/active/posted split,
-- but only the shelf-position dimension — a node's own in-progress state
-- (open/drafted/done) is unrelated and untouched. New projects start
-- 'active' (matches today's behaviour: a freshly created piece already
-- shows as active work, never queued).
--
-- The writing_ethos/emotional_journey/core_truth/*_goals/open_threads/
-- is_locked columns on studio_nodes exist so /write's Gather, Shape and Test
-- modes can be repointed at the node tree without losing any of the five
-- modes. studio_anchor_lines mirrors the main app's anchor_lines table.
-- Additive throughout.
-- ============================================================================

create type studio_project_shelf_stage as enum ('queued', 'active', 'completed');

alter table studio_projects add column if not exists shelf_stage studio_project_shelf_stage not null default 'active';
alter table studio_projects add column if not exists completed_at timestamptz;

alter table studio_nodes add column if not exists writing_ethos text;
alter table studio_nodes add column if not exists emotional_journey text;
alter table studio_nodes add column if not exists core_truth text;
alter table studio_nodes add column if not exists substack_goals text;
alter table studio_nodes add column if not exists short_form_goals text;
alter table studio_nodes add column if not exists open_threads text[];
alter table studio_nodes add column if not exists is_locked boolean not null default false;

create table if not exists studio_anchor_lines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references studio_projects(id) on delete cascade not null,
  node_id uuid references studio_nodes(id) on delete set null,
  text text not null,
  created_at timestamptz default now()
);
alter table studio_anchor_lines enable row level security;
create policy "Users can only access their own studio_anchor_lines"
  on studio_anchor_lines for all using (auth.uid() = user_id);

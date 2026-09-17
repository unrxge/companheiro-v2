-- ============================================================================
-- 009_migrate_pieces_to_nodes.sql — Phase 5 of the Project Board -> Studio
-- migration: copy every existing pieces/ideas row (and its piece_sections,
-- anchor_lines, tasks, post_publication_logs) forward onto the
-- studio_projects/studio_nodes shape, so the user's real, pre-existing work
-- appears on the shelf alongside anything created through the new Idea
-- Lab/Write flow (see supabase's ../..-level src/app/api/idea-lab/core-
-- concept/save/route.ts for the Phase 3 rewiring this mirrors).
--
-- HARD GUARANTEES:
--   * Pure additive COPY. Never deletes/updates/truncates pieces, ideas,
--     piece_sections, anchor_lines, tasks, post_publication_logs, or
--     session_logs. Those tables, and the old /project-board + /write?
--     piece_id= routes that read them, stay exactly as they are.
--   * Safe to re-run. studio_projects.migrated_from_piece_id (unique) is the
--     idempotency gate: pieces_to_migrate (the first CTE below) only selects
--     pieces with no existing studio_projects row already claiming them, so
--     a second run of this whole file sees zero rows to migrate and every
--     downstream CTE (all joined off pieces_to_migrate/new_root_nodes) is
--     correspondingly empty — a clean no-op, not a duplicate insert.
--   * studio_nodes.migrated_from_piece_id (root nodes) and
--     migrated_from_section_id (section-derived child nodes) are the join
--     keys used to attach anchor_lines/tasks/post_publication_logs to the
--     right migrated node without re-deriving anything.
--
-- session_logs is deliberately NOT migrated. An earlier investigation
-- confirmed its write route has zero live callers anywhere in the app and
-- its data is fetched-but-never-rendered in the UI — already vestigial.
-- Left in place, untouched, unmigrated; this is a documented decision.
--
-- The legacy `projects` table (supabase/migrations/001_initial_schema.sql,
-- table 5 — distinct from studio_projects) and pieces.project_id/
-- pieces.next_action/pieces.format are also not part of this migration: they
-- have zero live callers / no studio_nodes equivalent, and were out of scope
-- per the schema mapping this migration follows.
--
-- Written as a single paste for the Supabase SQL editor: no procedural code,
-- just chained `with ... insert ... returning` CTEs ending in one summary
-- `select`. Run against production only after manual line-by-line review.
-- ============================================================================

-- ── idempotency markers ─────────────────────────────────────────────────────
-- add column if not exists is natively re-runnable; add constraint is not
-- (postgres has no "add constraint if not exists"), so those are wrapped in
-- the same do $$ ... exception when duplicate_object $$ guard 007/008 use
-- for enum/policy creation, to keep this whole file safe to paste twice.
alter table studio_projects add column if not exists migrated_from_piece_id uuid;
do $$ begin
  alter table studio_projects add constraint studio_projects_migrated_from_piece_id_key unique (migrated_from_piece_id);
exception when duplicate_object then null;
end $$;

alter table studio_nodes add column if not exists migrated_from_piece_id uuid;
alter table studio_nodes add column if not exists migrated_from_section_id uuid;
do $$ begin
  alter table studio_nodes add constraint studio_nodes_migrated_from_piece_id_key unique (migrated_from_piece_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table studio_nodes add constraint studio_nodes_migrated_from_section_id_key unique (migrated_from_section_id);
exception when duplicate_object then null;
end $$;

-- ── the migration itself ────────────────────────────────────────────────────
with

-- Every piece not yet migrated, joined to its idea (idea_id is nullable —
-- LEFT JOIN), with every derived value computed exactly once so the same
-- rules jsonb / status / stage lands identically on both the project row and
-- its root node.
pieces_to_migrate as (
  select
    p.id                                            as piece_id,
    p.user_id,
    p.created_at,
    p.title,
    p.arc::text                                     as arc_text,
    p.thematic_territory,
    coalesce(p.conviction_statement, i.one_sentence, '') as intent,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
                 'id', uuid_generate_v4(),
                 'text', t,
                 'created_at', p.created_at,
                 'retired_at', null
               ))
        from unnest(coalesce(p.open_threads, array[]::text[])) as t
      ),
      '[]'::jsonb
    )                                                as rules_json,
    -- shelf position: queued/posted map directly, every other stage is
    -- still-in-progress work and belongs in 'active'.
    case p.stage
      when 'queued' then 'queued'
      when 'posted' then 'completed'
      else 'active'
    end                                              as shelf_stage_val,
    case when p.stage = 'posted' then p.posted_at else null end as completed_at_val,
    -- node progress: posted is done; writing/translating/executing/testing
    -- are all "there's a draft in motion" -> drafted; conceptualising and
    -- queued (nothing written yet, or paused before writing) -> open.
    case p.stage
      when 'posted'          then 'done'
      when 'writing'         then 'drafted'
      when 'translating'     then 'drafted'
      when 'executing'       then 'drafted'
      when 'testing'         then 'drafted'
      when 'conceptualising' then 'open'
      when 'queued'          then 'open'
      else 'open'
    end                                              as node_status_val,
    -- approximate word count; empty/null draft -> 0 rather than
    -- regexp_split_to_array's misleading 1-element {''} result.
    case
      when coalesce(trim(p.substack_draft), '') = '' then 0
      else array_length(regexp_split_to_array(trim(p.substack_draft), '\s+'), 1)
    end                                              as extent_val,
    p.substack_draft,
    p.writing_ethos,
    p.emotional_journey,
    p.core_truth,
    p.substack_goals,
    p.short_form_goals,
    p.open_threads,
    p.short_form_script
  from pieces p
  left join ideas i on i.id = p.idea_id
  where not exists (
    select 1 from studio_projects sp where sp.migrated_from_piece_id = p.id
  )
),

new_projects as (
  insert into studio_projects (
    user_id, title, intent, rules, arc, thematic_territory,
    shelf_stage, completed_at, migrated_from_piece_id, created_at, updated_at
  )
  select
    user_id, title, intent, rules_json, arc_text, thematic_territory,
    shelf_stage_val::studio_project_shelf_stage, completed_at_val,
    piece_id, created_at, created_at
  from pieces_to_migrate
  returning id, migrated_from_piece_id
),

-- The root node: one per migrated piece, parent_id null, carrying every
-- Gather/Shape/Write/Test field Write mode reads. body = substack_draft
-- (the flattened draft) — the field most important not to lose.
new_root_nodes as (
  insert into studio_nodes (
    user_id, project_id, parent_id, position, title, intent, beat,
    stands_whole, rules, body, extent, status,
    writing_ethos, emotional_journey, core_truth,
    substack_goals, short_form_goals, open_threads, short_form_script,
    is_locked, migrated_from_piece_id, created_at, updated_at
  )
  select
    ptm.user_id, np.id, null, 0,
    left(ptm.title, 200), left(ptm.intent, 4000), '',
    true, ptm.rules_json, coalesce(ptm.substack_draft, ''), ptm.extent_val,
    ptm.node_status_val::studio_node_status,
    ptm.writing_ethos, ptm.emotional_journey, ptm.core_truth,
    ptm.substack_goals, ptm.short_form_goals, ptm.open_threads, ptm.short_form_script,
    false, ptm.piece_id, ptm.created_at, ptm.created_at
  from pieces_to_migrate ptm
  join new_projects np on np.migrated_from_piece_id = ptm.piece_id
  returning id, project_id, migrated_from_piece_id
),

-- Child nodes for each piece's sections. status is derived: locked sections
-- read as finished ('done'); unlocked sections with any content are
-- in-progress ('drafted'); empty unlocked sections are untouched ('open').
new_section_nodes as (
  insert into studio_nodes (
    user_id, project_id, parent_id, position, title, intent, beat,
    stands_whole, rules, body, extent, status, is_locked,
    migrated_from_section_id, created_at, updated_at
  )
  select
    ps.user_id, nrn.project_id, nrn.id, ps.position,
    left(coalesce(ps.label, ''), 200), '', left(coalesce(ps.intended_emotion, ''), 500),
    false, '[]'::jsonb, coalesce(ps.content, ''),
    case
      when coalesce(trim(ps.content), '') = '' then 0
      else array_length(regexp_split_to_array(trim(ps.content), '\s+'), 1)
    end,
    (case
      when coalesce(ps.is_locked, false) then 'done'
      when coalesce(trim(ps.content), '') <> '' then 'drafted'
      else 'open'
    end)::studio_node_status,
    coalesce(ps.is_locked, false),
    ps.id, ps.created_at, ps.updated_at
  from piece_sections ps
  join new_root_nodes nrn on nrn.migrated_from_piece_id = ps.piece_id
  returning id, migrated_from_section_id, project_id
),

-- Anchor lines follow their section when it migrated; a null section_id (or
-- one whose section wasn't found, which shouldn't happen but is handled
-- defensively) falls back to the root node.
new_anchor_lines as (
  insert into studio_anchor_lines (user_id, project_id, node_id, text, created_at)
  select
    al.user_id, nrn.project_id, coalesce(nsn.id, nrn.id), al.text, al.created_at
  from anchor_lines al
  join new_root_nodes nrn on nrn.migrated_from_piece_id = al.piece_id
  left join new_section_nodes nsn on nsn.migrated_from_section_id = al.section_id
  returning id
),

-- Tasks were always piece_id-scoped (never section-scoped) in the old
-- schema, so every migrated task attaches to the piece's root node.
new_tasks as (
  insert into studio_tasks (
    user_id, project_id, node_id, title, type, status,
    is_writing_related, "order", created_at
  )
  select
    t.user_id, nrn.project_id, nrn.id, t.title,
    t.type::text::studio_task_type, t.status::text::studio_task_status,
    t.is_writing_related, t."order", t.created_at
  from tasks t
  join new_root_nodes nrn on nrn.migrated_from_piece_id = t.piece_id
  returning id
),

-- post_publication_logs has no project_id column (mirrors the main table,
-- which is piece_id-only); fts is a generated column, left uninserted.
new_pub_logs as (
  insert into studio_post_publication_logs (
    user_id, node_id, thread, what_it_opened, unresolved,
    natural_continuations, created_at
  )
  select
    ppl.user_id, nrn.id, ppl.thread, ppl.what_it_opened, ppl.unresolved,
    ppl.natural_continuations, ppl.created_at
  from post_publication_logs ppl
  join new_root_nodes nrn on nrn.migrated_from_piece_id = ppl.piece_id
  returning id
)

select
  (select count(*) from new_projects)    as projects_migrated,
  (select count(*) from new_root_nodes)  as root_nodes_migrated,
  (select count(*) from new_section_nodes) as section_nodes_migrated,
  (select count(*) from new_anchor_lines)  as anchor_lines_migrated,
  (select count(*) from new_tasks)         as tasks_migrated,
  (select count(*) from new_pub_logs)      as post_publication_logs_migrated;

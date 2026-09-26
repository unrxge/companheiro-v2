-- ============================================================================
-- 027_nodes_and_threads.sql — the nested work model
--
-- Replaces the infinite canvas with a tree of nodes plus a cross-cutting
-- layer of threads. Settled in conversation, 2026-09-14:
--
--   * arbitrary depth. a node contains nodes. an essay is one level; an album
--     is three; a film series is four. no altitude is hard-coded anywhere.
--   * a node is an intention, not a container. it carries what it is for.
--   * completeness is a property, not a type. some nodes claim to stand whole
--     (asked about arc), some are parts (asked about function), some are both.
--   * threads cut across the sequence. a node belongs to its parent AND to any
--     number of threads, so this is a tree with a cross-cutting layer over it —
--     not a pure hierarchy. going into a thread gives a filtered read.
--   * rules have teeth. they check at boundaries, never while writing, and a
--     violation arrives as a question that can be answered by amending the rule.
--
-- Additive: nothing in 001 is dropped. The canvas tables stay for now so any
-- existing project still loads; the new UI does not read them.
-- ============================================================================

-- ── the project's own intention and rules ───────────────────────────────────
-- The project is the outermost altitude, so it carries the same two things
-- every node does: what it is for, and the rules that can catch you. Concept
-- revisions from 001 stay for history; the new views read these.
alter table studio_projects add column if not exists intent text not null default '';
alter table studio_projects add column if not exists rules  jsonb not null default '[]'::jsonb;

-- ── enums ───────────────────────────────────────────────────────────────────
create type studio_node_status as enum ('open', 'drafted', 'done');
create type studio_check_outcome as enum ('fixed', 'amended', 'meant_it', 'dismissed');

-- ── nodes: the whole work, at every altitude ────────────────────────────────
create table studio_nodes (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references studio_projects(id) on delete cascade,
  parent_id     uuid references studio_nodes(id) on delete cascade,   -- null = top of the project
  position      integer not null default 0,                           -- order among siblings
  title         text not null default '',
  -- what this part is for. the node's reason to exist, in the person's words.
  intent        text not null default '',
  -- the beat this part carries in the containing work's journey. free text;
  -- the storyline view reads it under each block.
  beat          text not null default '',
  -- does this claim to be complete in itself? a film does, a scene does not,
  -- an episode does both and is asked both sets of questions.
  stands_whole  boolean not null default false,
  -- rules with teeth: [{ id, text, created_at, retired_at }]
  rules         jsonb not null default '[]'::jsonb,
  -- the writing, when this node is a leaf. Tiptap HTML (lib/rich-text.ts).
  body          text not null default '',
  -- cached word count of body, so the storyline axis can show extent without
  -- shipping every body to the client. maintained by the API on write.
  extent        integer not null default 0,
  status        studio_node_status not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (parent_id is null or parent_id <> id),
  check (char_length(title) <= 200),
  check (char_length(intent) <= 4000),
  check (char_length(beat) <= 500)
);
alter table studio_nodes enable row level security;
create policy "studio_nodes own rows" on studio_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_nodes_project_idx on studio_nodes (project_id, parent_id nulls first, position);
create index studio_nodes_parent_idx  on studio_nodes (parent_id, position);
create trigger studio_nodes_touch before update on studio_nodes
  for each row execute function studio_touch_updated_at();

-- parent must live in the same project; no cycles; depth capped at 6 so a
-- runaway client can never build an unwalkable tree.
create or replace function studio_check_node_parent() returns trigger
language plpgsql as $$
declare
  walker uuid;
  hops   integer := 0;
  p_proj uuid;
begin
  if new.parent_id is null then return new; end if;

  select project_id into p_proj from studio_nodes where id = new.parent_id;
  if p_proj is null then raise exception 'parent node not found'; end if;
  if p_proj <> new.project_id then raise exception 'a node never leaves its project'; end if;

  walker := new.parent_id;
  while walker is not null loop
    if walker = new.id then raise exception 'a node cannot contain itself'; end if;
    hops := hops + 1;
    if hops > 6 then raise exception 'nesting stops at six'; end if;
    select parent_id into walker from studio_nodes where id = walker;
  end loop;
  return new;
end $$;
create trigger studio_nodes_parent_check before insert or update of parent_id on studio_nodes
  for each row execute function studio_check_node_parent();

-- ── threads: the things that run across the sequence ────────────────────────
-- a character's arc, a question being seeded, a motif, an argument being built.
-- a thread is a node-like object: it has intent and rules of its own.
create table studio_threads (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  position    integer not null default 0,
  name        text not null default '',
  intent      text not null default '',
  rules       jsonb not null default '[]'::jsonb,
  hue         text not null default 'tide',   -- meaning palette key
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(name) <= 120),
  check (char_length(intent) <= 4000)
);
alter table studio_threads enable row level security;
create policy "studio_threads own rows" on studio_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_threads_project_idx on studio_threads (project_id, position);
create trigger studio_threads_touch before update on studio_threads
  for each row execute function studio_touch_updated_at();

-- ── the cross-cutting layer ─────────────────────────────────────────────────
-- note = what this node does for this thread. the filtered read shows it above
-- the node's own words.
create table studio_node_threads (
  node_id    uuid not null references studio_nodes(id) on delete cascade,
  thread_id  uuid not null references studio_threads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  note       text not null default '',
  created_at timestamptz not null default now(),
  primary key (node_id, thread_id),
  check (char_length(note) <= 1000)
);
alter table studio_node_threads enable row level security;
create policy "studio_node_threads own rows" on studio_node_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_node_threads_thread_idx on studio_node_threads (thread_id);

-- a node and a thread must be in the same project
create or replace function studio_check_node_thread() returns trigger
language plpgsql as $$
declare n_proj uuid; t_proj uuid;
begin
  select project_id into n_proj from studio_nodes   where id = new.node_id;
  select project_id into t_proj from studio_threads where id = new.thread_id;
  if n_proj is null or t_proj is null or n_proj <> t_proj then
    raise exception 'a thread never leaves its project';
  end if;
  return new;
end $$;
create trigger studio_node_threads_check before insert or update on studio_node_threads
  for each row execute function studio_check_node_thread();

-- ── rule checks ─────────────────────────────────────────────────────────────
-- fired at a boundary (a node marked drafted, or asked for by hand), never
-- while writing. `question` is what the companion asked. the person answers by
-- fixing the work, amending the rule, saying they meant it, or dismissing.
create table studio_rule_checks (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references studio_projects(id) on delete cascade,
  node_id      uuid not null references studio_nodes(id) on delete cascade,
  -- where the rule came from: a node above, or a thread. both nullable so a
  -- check survives its source being deleted.
  source_node_id   uuid references studio_nodes(id) on delete set null,
  source_thread_id uuid references studio_threads(id) on delete set null,
  rule_id      text not null,          -- the rule's id inside its rules array
  rule_text    text not null,          -- snapshotted, so history stays readable
  question     text not null,
  outcome      studio_check_outcome,
  outcome_note text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table studio_rule_checks enable row level security;
create policy "studio_rule_checks own rows" on studio_rule_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_rule_checks_node_idx on studio_rule_checks (node_id, created_at desc);
create index studio_rule_checks_open_idx on studio_rule_checks (project_id) where outcome is null;

-- ── the whole tree in one round trip ────────────────────────────────────────
-- rows only; the client builds the tree. bodies are included because the flow
-- view and the filtered thread read both need them, and a project's text is
-- small next to the media the canvas used to carry.
create or replace function studio_tree(p_project_id uuid)
returns jsonb language sql security invoker stable as $$
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.parent_id nulls first, n.position, n.created_at)
        from studio_nodes n
       where n.project_id = p_project_id and n.user_id = auth.uid()
    ), '[]'::jsonb),
    'threads', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.position, t.created_at)
        from studio_threads t
       where t.project_id = p_project_id and t.user_id = auth.uid()
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object(
               'node_id', nt.node_id, 'thread_id', nt.thread_id, 'note', nt.note))
        from studio_node_threads nt
        join studio_nodes n on n.id = nt.node_id
       where n.project_id = p_project_id and nt.user_id = auth.uid()
    ), '[]'::jsonb),
    'open_checks', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
        from studio_rule_checks c
       where c.project_id = p_project_id and c.user_id = auth.uid() and c.outcome is null
    ), '[]'::jsonb)
  );
$$;

-- next position among siblings, atomic enough for a single-user app
create or replace function studio_next_node_position(p_project_id uuid, p_parent_id uuid)
returns integer language sql security invoker as $$
  select coalesce(max(position), -1) + 1
    from studio_nodes
   where project_id = p_project_id and user_id = auth.uid()
     and parent_id is not distinct from p_parent_id;
$$;

-- ── rollback ────────────────────────────────────────────────────────────────
-- drop function studio_next_node_position, studio_tree;
-- drop table studio_rule_checks, studio_node_threads, studio_threads;
-- drop function studio_check_node_thread, studio_check_node_parent;
-- drop table studio_nodes;
-- drop type studio_check_outcome, studio_node_status;
-- alter table studio_projects drop column rules, drop column intent;

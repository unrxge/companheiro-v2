-- ============================================================================
-- 003_vision_talk.sql — the companion, at every altitude
--
-- One conversation per altitude: node_id null is the whole project, otherwise
-- the part it belongs to. The companion talks about strategy and shape — what
-- this is for, whether the parts add up, where the direction is drifting — and
-- never writes the work. The writing studio keeps its own separate thread.
-- ============================================================================

create table studio_vision_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  -- null = the whole project; otherwise the part this conversation is about.
  node_id     uuid references studio_nodes(id) on delete cascade,
  role        studio_talk_role not null,
  text        text not null,
  created_at  timestamptz not null default now(),
  check (char_length(text) <= 20000)
);
alter table studio_vision_messages enable row level security;
create policy "studio_vision_messages own rows" on studio_vision_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_vision_messages_scope_idx
  on studio_vision_messages (project_id, node_id, created_at);

-- ── rollback ────────────────────────────────────────────────────────────────
-- drop table studio_vision_messages;

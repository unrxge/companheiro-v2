-- 035: past conversations in the vision room.
--
-- The room kept one endless conversation per project. Now a project can hold
-- several, each with a short title and a one-line summary written after it
-- gets going, so a person can come back to one and carry on.
--
-- Only adds: a table, and a nullable column on studio_vision_messages. The
-- conversation inside a part (node_id set) never gets a conversation_id and
-- is untouched. Every message already said in the room (node_id null) is
-- gathered into one conversation per project, so nothing said before is lost.
-- Until this runs, the room carries on as one conversation per project and
-- shows no list of past ones.
--
-- Reversible:
--   alter table studio_vision_messages drop column conversation_id;
--   drop table studio_vision_conversations;

create table if not exists studio_vision_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  -- Written by the companion once the conversation has some substance; '' until then.
  title       text not null default '',
  summary     text not null default '',
  -- How many messages there were when the title was last written, so it is
  -- rewritten as the conversation moves on, not on every reply.
  titled_at   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table studio_vision_conversations enable row level security;
drop policy if exists "studio_vision_conversations own rows" on studio_vision_conversations;
create policy "studio_vision_conversations own rows" on studio_vision_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists studio_vision_conversations_project_idx
  on studio_vision_conversations (project_id, updated_at desc);

grant select, insert, update, delete on public.studio_vision_conversations to authenticated, service_role;

alter table studio_vision_messages
  add column if not exists conversation_id uuid references studio_vision_conversations(id) on delete cascade;
create index if not exists studio_vision_messages_conversation_idx
  on studio_vision_messages (conversation_id, created_at);

-- What was said in the room before this, as one conversation per project.
insert into studio_vision_conversations (user_id, project_id, created_at, updated_at)
select user_id, project_id, min(created_at), max(created_at)
from studio_vision_messages
where node_id is null and conversation_id is null
group by user_id, project_id;

update studio_vision_messages m
set conversation_id = c.id
from studio_vision_conversations c
where m.node_id is null
  and m.conversation_id is null
  and c.project_id = m.project_id
  and c.user_id = m.user_id;

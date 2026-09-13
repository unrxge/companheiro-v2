-- ============================================================================
-- 001_studio_foundation.sql — Companheiro studio: the project canvas
-- Same Supabase project as the main app. Every object is studio_-prefixed.
-- Every table: uuid_generate_v4 ids, timestamptz created_at, user_id on every
-- row, RLS auth.uid() = user_id (using + with check). Nothing in the main
-- app's schema is touched; portrait_entries is only ever SELECTed by the
-- studio's API under the person's own RLS.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── enums ───────────────────────────────────────────────────────────────────
create type studio_project_status as enum ('active', 'resting', 'finished', 'kept', 'abandoned');
create type studio_block_type as enum (
  'concept', 'since', 'update', 'timeline', 'draft', 'anchor', 'note', 'reference',
  'commitment', 'compass', 'frame', 'heading', 'divider', 'image', 'gallery',
  'recording', 'palette'
);
create type studio_placed_by as enum ('auto', 'person');
create type studio_arrival_state as enum ('placed', 'unplaced');
create type studio_talk_kind as enum ('talk', 'direction');
create type studio_talk_role as enum ('person', 'companion');
create type studio_talk_input as enum ('typed', 'voice');
create type studio_compass_kind as enum ('refusal', 'non_negotiable', 'commitment', 'drift');
create type studio_compass_status as enum ('pending', 'active', 'rejected', 'dormant');
create type studio_commitment_resolution as enum ('done', 'let_go');
create type studio_catch_mark as enum ('right', 'wrong');
create type studio_draft_kind as enum ('essay', 'brief', 'copy', 'lyrics', 'other');
create type studio_posture as enum ('suggest', 'ask', 'locked');
create type studio_asset_kind as enum ('image', 'audio');
create type studio_concept_origin as enum ('creation', 'edit');

-- ── shared trigger: updated_at ──────────────────────────────────────────────
create or replace function studio_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── projects ────────────────────────────────────────────────────────────────
create table studio_projects (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null default 'untitled project',
  status            studio_project_status not null default 'active',
  resting_until     timestamptz,
  completed_at      timestamptz,
  completion_note   text,
  viewport          jsonb not null default '{"tx":80,"ty":80,"k":1}'::jsonb,
  settings          jsonb not null default '{"snap":true,"grid":true,"sizes":false}'::jsonb,
  auto_layout       boolean not null default true,     -- false after the first hand placement (D-064)
  composed_at       timestamptz,                       -- null until the client's first measured composition
  canvas_version    integer not null default 0,        -- bumped once per write batch by the API (D-031)
  last_opened_at    timestamptz not null default now(),
  opened_before_at  timestamptz not null default now(),-- "since you were here" cutoff (D-032)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table studio_projects enable row level security;
create policy "studio_projects own rows" on studio_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_projects_user_idx on studio_projects (user_id, status, updated_at desc);
create trigger studio_projects_touch before update on studio_projects
  for each row execute function studio_touch_updated_at();

-- resting: 14-day floor lives in the row, not in a button (D-060)
create or replace function studio_projects_status_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'resting' and old.status is distinct from 'resting' then
    new.resting_until = now() + interval '14 days';
  end if;
  if old.status = 'resting' and new.status = 'active'
     and old.resting_until is not null and old.resting_until > now() then
    raise exception 'project is resting until %', old.resting_until;
  end if;
  if new.status in ('finished', 'kept', 'abandoned') and new.completed_at is null then
    new.completed_at = now();
  end if;
  if new.status = 'active' then
    new.resting_until = null;
    new.completed_at = null;
  end if;
  return new;
end $$;
create trigger studio_projects_status_guard before update of status on studio_projects
  for each row execute function studio_projects_status_guard();

-- ── concept revisions (edits dated and kept; the block stores nothing) ──────
create table studio_concept_revisions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references studio_projects(id) on delete cascade,
  body         text not null,
  constraints  jsonb not null default '[]'::jsonb,      -- string[]
  origin       studio_concept_origin not null default 'edit',
  created_at   timestamptz not null default now()
);
alter table studio_concept_revisions enable row level security;
create policy "studio_concept_revisions own rows" on studio_concept_revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_concept_revisions_project_idx on studio_concept_revisions (project_id, created_at desc);

-- ── blocks: everything on the canvas ────────────────────────────────────────
-- World px; x/y/w multiples of 8; h measured for auto-height types (D-001).
-- Children of frames keep ABSOLUTE coordinates (D-019). Soft delete (D-029).
create table studio_blocks (
  id             uuid primary key default uuid_generate_v4(),  -- client-generated for creates
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references studio_projects(id) on delete cascade,
  type           studio_block_type not null,
  x              integer not null default 0,
  y              integer not null default 0,
  w              integer not null default 320,
  h              integer not null default 96,
  z              integer not null default 0,
  parent_id      uuid references studio_blocks(id) on delete set null,   -- a frame
  stacked_in     uuid references studio_blocks(id) on delete set null,   -- a timeline (updates only)
  name           text,
  locked         boolean not null default false,
  hidden         boolean not null default false,
  collapsed      boolean not null default false,                         -- frames only
  placed_by      studio_placed_by not null default 'auto',
  arrival_state  studio_arrival_state not null default 'placed',
  arrived_from   uuid,                                                   -- studio_talk_entries.id (fk below)
  struck_at      timestamptz,
  struck_by      text,                                                   -- the sentence that struck it
  content        jsonb not null default '{}'::jsonb,                     -- shape per type: types.ts
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check (w >= 8 and h >= 8),
  check (parent_id is null or parent_id <> id),
  check (stacked_in is null or stacked_in <> id)
);
alter table studio_blocks enable row level security;
create policy "studio_blocks own rows" on studio_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_blocks_project_live_idx on studio_blocks (project_id, z) where deleted_at is null;
create index studio_blocks_parent_idx on studio_blocks (parent_id) where parent_id is not null and deleted_at is null;
create index studio_blocks_stacked_idx on studio_blocks (stacked_in) where stacked_in is not null and deleted_at is null;
create index studio_blocks_arrivals_idx on studio_blocks (project_id, created_at)
  where arrival_state = 'unplaced' and deleted_at is null;
create unique index studio_blocks_one_concept on studio_blocks (project_id) where type = 'concept' and deleted_at is null;
create unique index studio_blocks_one_since   on studio_blocks (project_id) where type = 'since'   and deleted_at is null;
create unique index studio_blocks_one_compass on studio_blocks (project_id) where type = 'compass' and deleted_at is null;
create trigger studio_blocks_touch before update on studio_blocks
  for each row execute function studio_touch_updated_at();

-- parent must be a live frame in the same project; depth stops at 2 (D-019)
create or replace function studio_check_block_parent() returns trigger
language plpgsql as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;
  select type, project_id, parent_id into p
    from studio_blocks where id = new.parent_id and deleted_at is null;
  if p is null then raise exception 'parent frame not found'; end if;
  if p.type <> 'frame' then raise exception 'parent must be a frame'; end if;
  if p.project_id <> new.project_id then raise exception 'parent must be in the same project'; end if;
  if p.parent_id is not null and new.type = 'frame' then raise exception 'frames nest at most one level'; end if;
  return new;
end $$;
create trigger studio_blocks_parent_check before insert or update of parent_id on studio_blocks
  for each row execute function studio_check_block_parent();

-- stacked_in must be a live timeline in the same project; only updates stack (D-035)
create or replace function studio_check_block_stack() returns trigger
language plpgsql as $$
declare t record;
begin
  if new.stacked_in is null then return new; end if;
  if new.type <> 'update' then raise exception 'only updates stack into a timeline'; end if;
  select type, project_id into t from studio_blocks where id = new.stacked_in and deleted_at is null;
  if t is null or t.type <> 'timeline' or t.project_id <> new.project_id then
    raise exception 'stacked_in must be a live timeline in the same project';
  end if;
  return new;
end $$;
create trigger studio_blocks_stack_check before insert or update of stacked_in on studio_blocks
  for each row execute function studio_check_block_stack();

-- ── links (never leave a project) ───────────────────────────────────────────
create table studio_links (
  id             uuid primary key default uuid_generate_v4(),  -- client-generated
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references studio_projects(id) on delete cascade,
  from_block_id  uuid not null references studio_blocks(id) on delete cascade,
  to_block_id    uuid not null references studio_blocks(id) on delete cascade,
  word           text check (word is null or char_length(word) <= 24),
  created_at     timestamptz not null default now(),
  check (from_block_id <> to_block_id),
  unique (from_block_id, to_block_id)
);
alter table studio_links enable row level security;
create policy "studio_links own rows" on studio_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_links_project_idx on studio_links (project_id);

create or replace function studio_check_link_project() returns trigger
language plpgsql as $$
begin
  if (select count(*) from studio_blocks
      where id in (new.from_block_id, new.to_block_id) and project_id = new.project_id) <> 2 then
    raise exception 'links never leave a project';
  end if;
  return new;
end $$;
create trigger studio_links_project_check before insert or update on studio_links
  for each row execute function studio_check_link_project();

-- ── talk entries (daily talk + direction talk, one flat thread per project) ─
create table studio_talk_entries (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  kind        studio_talk_kind not null default 'talk',
  role        studio_talk_role not null,
  input       studio_talk_input,                     -- person rows
  text        text not null,
  reply_to    uuid references studio_talk_entries(id) on delete set null,  -- companion → person entry
  catch_id    uuid,                                  -- companion rows that speak a catch (fk below)
  sort        jsonb,                                 -- person rows: the validated TalkSort once applied
  sorted_at   timestamptz,                           -- null = not yet sorted (sweep target, D-054)
  truncated   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table studio_talk_entries enable row level security;
create policy "studio_talk_entries own rows" on studio_talk_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_talk_entries_project_idx on studio_talk_entries (project_id, created_at desc);
create index studio_talk_entries_unsorted_idx on studio_talk_entries (project_id, created_at)
  where role = 'person' and sorted_at is null;

alter table studio_blocks add constraint studio_blocks_arrived_from_fk
  foreign key (arrived_from) references studio_talk_entries(id) on delete set null;

-- ── compass entries (the portrait pattern, per project; commitments included) ─
-- Proposed by talk as 'pending'; only the person's verbs make them 'active'.
create table studio_compass_entries (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  project_id           uuid not null references studio_projects(id) on delete cascade,
  kind                 studio_compass_kind not null,
  statement            text not null,                -- current wording (the person's, after correction)
  proposed_statement   text not null,                -- what talk proposed, kept for honesty
  status               studio_compass_status not null default 'pending',
  reinforcement_count  integer not null default 1,
  last_reinforced_at   timestamptz not null default now(),
  evidence             jsonb not null default '[]'::jsonb,  -- CompassEvidence[]: {entry_id, quote, at}
  source_entry_id      uuid references studio_talk_entries(id) on delete set null,
  decided_at           timestamptz,
  rejection_note       text,
  forgotten_at         timestamptz,
  -- commitments only
  block_id             uuid references studio_blocks(id) on delete set null,
  asked_at             timestamptz,
  ask_count            integer not null default 0,
  resolution           studio_commitment_resolution,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table studio_compass_entries enable row level security;
create policy "studio_compass_entries own rows" on studio_compass_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_compass_project_idx on studio_compass_entries (project_id, status, kind);
create index studio_compass_ask_idx on studio_compass_entries (project_id, asked_at nulls first)
  where kind = 'commitment' and status = 'active' and resolution is null;
create trigger studio_compass_entries_touch before update on studio_compass_entries
  for each row execute function studio_touch_updated_at();

-- atomic reinforcement with evidence; invoker rights so RLS applies
create or replace function studio_reinforce_compass_entry(p_entry_id uuid, p_evidence jsonb default null)
returns void language sql security invoker as $$
  update studio_compass_entries
    set reinforcement_count = reinforcement_count + 1,
        last_reinforced_at = now(),
        evidence = case when p_evidence is null then evidence else evidence || p_evidence end
    where id = p_entry_id and user_id = auth.uid() and status in ('active', 'pending');
$$;

-- ── catches: a decision that collides with an active refusal, spoken once ───
create table studio_catches (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  project_id         uuid not null references studio_projects(id) on delete cascade,
  refusal_entry_id   uuid not null references studio_compass_entries(id) on delete cascade,
  person_entry_id    uuid not null references studio_talk_entries(id) on delete cascade,
  decision_text      text not null,                  -- verbatim span of the person's words
  sentence           text not null,                  -- what the companion said (MODELS.deep, D-056)
  spoken_entry_id    uuid references studio_talk_entries(id) on delete set null,
  mark               studio_catch_mark,
  marked_at          timestamptz,
  created_at         timestamptz not null default now(),
  unique (refusal_entry_id, person_entry_id)
);
alter table studio_catches enable row level security;
create policy "studio_catches own rows" on studio_catches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_catches_project_idx on studio_catches (project_id, created_at desc);
create index studio_catches_unmarked_idx on studio_catches (project_id) where mark is null;

alter table studio_talk_entries add constraint studio_talk_entries_catch_fk
  foreign key (catch_id) references studio_catches(id) on delete set null;

-- ── drafts + sections + chat (the minimal studio behind a draft block) ──────
create table studio_drafts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  block_id    uuid references studio_blocks(id) on delete set null,
  title       text not null default 'untitled draft',
  kind        studio_draft_kind not null default 'essay',
  posture     studio_posture not null default 'ask',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table studio_drafts enable row level security;
create policy "studio_drafts own rows" on studio_drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_drafts_project_idx on studio_drafts (project_id, updated_at desc);
create trigger studio_drafts_touch before update on studio_drafts
  for each row execute function studio_touch_updated_at();

create table studio_draft_sections (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  draft_id    uuid not null references studio_drafts(id) on delete cascade,
  position    integer not null default 0,
  label       text,
  content     text not null default '',              -- Tiptap HTML (lib/rich-text.ts)
  is_locked   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table studio_draft_sections enable row level security;
create policy "studio_draft_sections own rows" on studio_draft_sections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_draft_sections_draft_idx on studio_draft_sections (draft_id, position);
create trigger studio_draft_sections_touch before update on studio_draft_sections
  for each row execute function studio_touch_updated_at();

create table studio_draft_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  draft_id    uuid not null references studio_drafts(id) on delete cascade,
  role        studio_talk_role not null,
  text        text not null,
  created_at  timestamptz not null default now()
);
alter table studio_draft_messages enable row level security;
create policy "studio_draft_messages own rows" on studio_draft_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_draft_messages_draft_idx on studio_draft_messages (draft_id, created_at);

-- ── assets (for the eyes and ears; the companion never reads the file) ──────
create table studio_assets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references studio_projects(id) on delete cascade,
  kind          studio_asset_kind not null,
  storage_path  text not null unique,                -- '<user_id>/<project_id>/<asset_id>.<ext>'
  thumb_path    text,                                -- images: client-made 480 px-wide copy
  mime          text not null,
  bytes         integer not null check (bytes > 0 and bytes <= 26214400),
  width         integer,
  height        integer,
  duration_s    numeric(8,2),
  envelope      jsonb,                               -- audio: number[24] waveform, computed client-side at commit
  own_voice     boolean not null default false,      -- recordings: true only when the person recorded themselves
  transcript    text,                                -- ONLY when own_voice (Web Speech live capture)
  created_at    timestamptz not null default now(),
  check (transcript is null or own_voice = true)
);
alter table studio_assets enable row level security;
create policy "studio_assets own rows" on studio_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_assets_project_idx on studio_assets (project_id, created_at desc);

-- ── storage: private bucket, folder = auth.uid() ────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-media', 'studio-media', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif',
        'audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg'])
on conflict (id) do nothing;

create policy "studio-media owner select" on storage.objects for select to authenticated
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio-media owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio-media owner update" on storage.objects for update to authenticated
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio-media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- Files are served through createSignedUrl (60 min) from the API; never public.

-- ── since you were here: one round trip (D-032) ─────────────────────────────
create or replace function studio_since(p_project_id uuid)
returns jsonb language sql security invoker stable as $$
  select jsonb_build_object(
    'cutoff', p.opened_before_at,
    'last_opened_at', p.last_opened_at,
    'canvas_version', p.canvas_version,
    'last_said', (select jsonb_build_object('text', left(t.text, 140), 'at', t.created_at, 'kind', t.kind)
                    from studio_talk_entries t
                   where t.project_id = p.id and t.role = 'person'
                   order by t.created_at desc limit 1),
    'arrived_since', (select count(*) from studio_blocks b
                       where b.project_id = p.id and b.arrived_from is not null
                         and b.deleted_at is null and b.created_at > p.opened_before_at),
    'waiting', (select count(*) from studio_blocks b
                 where b.project_id = p.id and b.arrival_state = 'unplaced' and b.deleted_at is null),
    'compass_pending', (select count(*) from studio_compass_entries c
                         where c.project_id = p.id and c.status = 'pending'),
    'catches_unmarked', (select count(*) from studio_catches k
                          where k.project_id = p.id and k.mark is null),
    'commitments_open', (select count(*) from studio_compass_entries c
                          where c.project_id = p.id and c.kind = 'commitment'
                            and c.status = 'active' and c.resolution is null)
  )
  from studio_projects p
  where p.id = p_project_id and p.user_id = auth.uid();
$$;

-- rotate the window only when the last open is older than 30 minutes (D-032)
create or replace function studio_open_project(p_project_id uuid)
returns jsonb language plpgsql security invoker as $$
declare v_last timestamptz;
begin
  select last_opened_at into v_last from studio_projects
    where id = p_project_id and user_id = auth.uid();
  if v_last is null then return null; end if;
  if v_last < now() - interval '30 minutes' then
    update studio_projects set opened_before_at = last_opened_at, last_opened_at = now()
      where id = p_project_id and user_id = auth.uid();
  else
    update studio_projects set last_opened_at = now()
      where id = p_project_id and user_id = auth.uid();
  end if;
  return studio_since(p_project_id);
end $$;

-- next z for a project, atomic
create or replace function studio_next_z(p_project_id uuid)
returns integer language sql security invoker as $$
  select coalesce(max(z), 0) + 1 from studio_blocks
   where project_id = p_project_id and user_id = auth.uid();
$$;

-- ── rollback (reverse order; kept for the record) ───────────────────────────
-- drop function studio_next_z, studio_open_project, studio_since;
-- drop policy "studio-media owner delete" on storage.objects; ... (4 policies)
-- delete from storage.buckets where id = 'studio-media';
-- drop table studio_assets, studio_draft_messages, studio_draft_sections, studio_drafts;
-- alter table studio_talk_entries drop constraint studio_talk_entries_catch_fk;
-- drop table studio_catches; drop function studio_reinforce_compass_entry;
-- drop table studio_compass_entries;
-- alter table studio_blocks drop constraint studio_blocks_arrived_from_fk;
-- drop table studio_talk_entries, studio_links, studio_blocks, studio_concept_revisions, studio_projects;
-- drop function studio_check_link_project, studio_check_block_stack, studio_check_block_parent,
--   studio_projects_status_guard, studio_touch_updated_at;
-- drop type (all studio_* enums).

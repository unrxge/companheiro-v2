-- Things on a project's canvas besides its pieces and threads: an image, a
-- recording, a task list. A new table only; nothing existing changes shape.
--
-- Each one starts from a piece's "+" and is drawn under the pieces it is
-- connected to (node_ids, top-level pieces of the same project; empty means
-- it stands on its own). board_x / board_y are null until a hand places it,
-- the same as a thread's hub. `w` is the width a hand gave it (images, and a
-- task list within narrow limits); null is the kind's own default.
--
--   image      asset_id -> studio_assets, content { caption }
--   recording  asset_id -> studio_assets, content { title }
--   tasks      content { tasks: [{ id, title, done }], writing_closed }
--              (its own tasks; the writing tasks it shows are studio_tasks
--              rows of the pieces it is connected to, never copied here)
--
-- The files themselves live where they already did: the private studio-media
-- bucket and studio_assets (studio migration 001). The companion never reads
-- either table.
create table if not exists studio_board_items (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  kind        text not null check (kind in ('image', 'recording', 'tasks')),
  asset_id    uuid references studio_assets(id) on delete set null,
  node_ids    uuid[] not null default '{}',
  board_x     integer,
  board_y     integer,
  w           integer,
  content     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table studio_board_items enable row level security;
do $$ begin
  create policy "studio_board_items own rows" on studio_board_items
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

create index if not exists studio_board_items_project_idx
  on studio_board_items (project_id, created_at);

drop trigger if exists studio_board_items_touch on studio_board_items;
create trigger studio_board_items_touch before update on studio_board_items
  for each row execute function studio_touch_updated_at();

-- ── rollback (kept for the record) ──────────────────────────────────────────
-- drop table studio_board_items;

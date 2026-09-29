-- Document history for a piece: earlier versions of its sections, so the
-- writer can look back and restore one. A new table only; nothing existing
-- changes shape.
--
-- A revision is the piece as it stood just BEFORE an editing stretch began
-- (at most one per ten minutes of editing), and before anything that
-- rewrites it wholesale: shaping/dividing into sections, removing a section,
-- restoring an older version. `parts` holds every node under the piece (and
-- the piece itself when it has no sections):
--   [{ id, parent_id, position, title, beat, body, is_leaf }]
-- Only leaves carry a body; a node with children keeps a flattened copy that
-- is recomputed on restore.
create table if not exists studio_piece_revisions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  piece_id    uuid not null references studio_nodes(id) on delete cascade,
  reason      text not null default 'edit',
  word_count  integer not null default 0,
  parts       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  check (reason in ('edit', 'restructure', 'remove', 'restore'))
);

alter table studio_piece_revisions enable row level security;
create policy "studio_piece_revisions own rows" on studio_piece_revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists studio_piece_revisions_piece_idx
  on studio_piece_revisions (piece_id, created_at desc);

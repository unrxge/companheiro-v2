-- ============================================================================
-- 033_post_publication_and_read.sql — studio_post_publication_logs, so
-- /post-publication and /read work for node-based work too (closing the last
-- gap of the Project Board -> Studio migration, 2026-09-17).
--
-- Mirrors the main app's post_publication_logs exactly (see
-- supabase/migrations/001_initial_schema.sql, table 8) — same columns, same
-- RLS shape — with node_id replacing piece_id, and the fts generated column
-- 009_add_fts_recall.sql later bolted onto post_publication_logs baked in
-- from the start since this table is new. Additive throughout; follows 007's
-- do $$ ... $$ guard style for the policy so this is safe to re-run.
-- ============================================================================

create table if not exists studio_post_publication_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  node_id uuid references studio_nodes(id) on delete cascade not null,
  thread text,
  what_it_opened text,
  unresolved text,
  natural_continuations text[],
  fts tsvector generated always as (
    to_tsvector('english',
      coalesce(thread, '') || ' ' ||
      coalesce(what_it_opened, '') || ' ' ||
      coalesce(unresolved, '')
    )
  ) stored
);
alter table studio_post_publication_logs enable row level security;
do $$ begin
  create policy "Users can only access their own studio_post_publication_logs"
    on studio_post_publication_logs for all using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
create index if not exists studio_post_publication_logs_node_idx on studio_post_publication_logs (node_id, created_at desc);
create index if not exists studio_post_publication_logs_fts_idx on studio_post_publication_logs using gin (fts);

-- ── rollback (reverse order; kept for the record) ───────────────────────────
-- drop table studio_post_publication_logs;

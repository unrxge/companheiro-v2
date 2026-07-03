-- Full-text search columns powering "echoes from the archive" recall.
-- Generated columns stay in sync automatically; GIN indexes keep search fast.
-- Additive only — no existing behavior changes.

alter table captures add column fts tsvector
  generated always as (
    to_tsvector('english', coalesce(raw_input, '') || ' ' || coalesce(unpacked, ''))
  ) stored;
create index captures_fts_idx on captures using gin (fts);

alter table pieces add column fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(conviction_statement, '') || ' ' ||
      coalesce(core_truth, '') || ' ' ||
      coalesce(emotional_journey, '')
    )
  ) stored;
create index pieces_fts_idx on pieces using gin (fts);

alter table post_publication_logs add column fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(thread, '') || ' ' ||
      coalesce(what_it_opened, '') || ' ' ||
      coalesce(unresolved, '')
    )
  ) stored;
create index post_publication_logs_fts_idx on post_publication_logs using gin (fts);

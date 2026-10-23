-- How the person said they feel about a finished piece, kept with the rest of
-- its reflection log (studio_post_publication_logs). One nullable column; the
-- older columns keep their meaning. Reads and writes that name it fall back to
-- the older shape until this is applied.
--
-- Supersedes 038 (said_it, felt), which belonged to a chip-based version of
-- the reflection that lasted a day. Those two columns are left where they are
-- and nothing reads or writes them any more.
alter table studio_post_publication_logs add column if not exists feeling text;

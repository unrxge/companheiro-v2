-- The reflection on a finished piece (studio_post_publication_logs) gains two
-- light answers: whether the piece said what its person set out to say, and
-- how they feel now it is done. Both nullable and additive; the four older
-- columns keep their meaning. Every read and write that names them falls
-- back to the older shape until this is applied.
alter table studio_post_publication_logs add column if not exists said_it text;
alter table studio_post_publication_logs add column if not exists felt text[];

do $$ begin
  alter table studio_post_publication_logs
    add constraint studio_post_publication_logs_said_it_check check (said_it is null or said_it in ('said', 'close', 'other'));
exception when duplicate_object then null;
end $$;

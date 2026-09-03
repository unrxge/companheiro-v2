-- Allow multiple in-progress explorations per user.
-- Previously limited to one via unique(user_id); now each draft is
-- independent and can be resumed or discarded on its own.
alter table conceptualise_drafts drop constraint if exists conceptualise_drafts_user_id_key;

create index if not exists conceptualise_drafts_user_id_idx on conceptualise_drafts(user_id);

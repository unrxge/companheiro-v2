-- Preserve the prompt that generated a conceptualise session so the
-- conversation has full context when resuming a draft.
alter table conceptualise_drafts add column if not exists question text;

-- Tasks get a category, so a piece's list can be folded into groups: the
-- generated ones under "Writing", the person's own under whatever they name.
-- Nullable and additive: existing rows keep working (null reads as "Writing"
-- for a writing task and "Other" for anything else), and every route that
-- selects it falls back to the old column list until this is applied.
alter table studio_tasks add column if not exists category text;

do $$ begin
  alter table studio_tasks add constraint studio_tasks_category_len check (category is null or char_length(category) <= 60);
exception when duplicate_object then null;
end $$;

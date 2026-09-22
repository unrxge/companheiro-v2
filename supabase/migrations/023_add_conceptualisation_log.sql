-- Keep the AI back-and-forth that shaped a project, so it can be re-read
-- from the board after the idea has been declared. The old `ideas` table had
-- this (conceptualisation_log) but it was lost in the Studio merge.
alter table studio_projects
  add column if not exists conceptualisation_log jsonb;

-- Marks a conceptualise draft that started from "Bring an idea", so a
-- resumed session keeps treating it as an idea the person already carries.
alter table conceptualise_drafts
  add column if not exists brought boolean not null default false;

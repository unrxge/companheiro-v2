-- Add conversation tracking to check_ins table
alter table check_ins
  add column full_conversation text,
  add column engaged_with_deeper_work boolean default false;

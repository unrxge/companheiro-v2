-- Add check_in_type enum
create type check_in_type as enum ('morning', 'after_work', 'evening', 'moment');

-- Add new columns to check_ins table
alter table check_ins
  add column check_in_type check_in_type,
  add column dream_content text;

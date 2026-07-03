-- Stores the system's interpretation of linked content (platform, title,
-- author, and Claude's read of the caption + thumbnail) alongside a capture.
-- Nullable and additive — safe for existing rows.
alter table captures
  add column link_context text;

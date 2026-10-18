-- 036_note_items.sql — a note on the canvas.
--
-- A fifth kind of thing on a project's canvas: a few words kept for later, a
-- thought or a reminder, like a note stuck on the wall. Most arrive from a
-- check-in ("note for the album: …", "remind me to …"), standing on their own,
-- connected to no piece. The words live in the item's own `content`
-- ({ text, note: 'thought' | 'reminder', done, from_check_in }), so there is no
-- new table, only the check that says which kinds exist.
--
-- Safe to run more than once.

alter table studio_board_items drop constraint if exists studio_board_items_kind_check;

alter table studio_board_items
  add constraint studio_board_items_kind_check
  check (kind in ('image', 'recording', 'tasks', 'palette', 'note'));

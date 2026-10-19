-- 037_link_items.sql — a link on the canvas.
--
-- A sixth kind of thing on a project's canvas: an address on the web. A video,
-- a song or a picture from a known place plays inside Companheiro; anything
-- else opens in a new tab. The address and its name live in the item's own
-- `content` ({ url, title }), so there is no new table, only the check that
-- says which kinds exist.
--
-- Safe to run more than once.

alter table studio_board_items drop constraint if exists studio_board_items_kind_check;

alter table studio_board_items
  add constraint studio_board_items_kind_check
  check (kind in ('image', 'recording', 'tasks', 'palette', 'note', 'link'));

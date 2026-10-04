-- 031_palette_items.sql — a colour palette on the canvas.
--
-- A fourth kind of thing a piece's "+" can make, beside an image, a recording
-- and a task list: a row of colours. It holds nothing but the colours and what
-- the person called them, in the item's own `content`, so there is no new
-- table and no file — only the check that says which kinds exist.
--
-- Like every other thing on the canvas, the companion never reads it.
--
-- Safe to run more than once.

alter table studio_board_items drop constraint if exists studio_board_items_kind_check;

alter table studio_board_items
  add constraint studio_board_items_kind_check
  check (kind in ('image', 'recording', 'tasks', 'palette'));

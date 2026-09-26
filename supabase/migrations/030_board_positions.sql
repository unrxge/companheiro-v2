-- ============================================================================
-- 030_board_positions.sql — free placement on the project board
--
-- The board (level 2) becomes a canvas you can rearrange, the same way the
-- shelf already is: a piece or a thread's hub can be dragged anywhere, and
-- "rearrange" puts everything back by clearing these columns to null.
--
--   null   → not hand-placed. A piece sits in its reading-order lane; a
--            thread's hub sits near the pieces it touches; the vision block
--            sits at the board's top-left corner. Nothing is ever lost.
--   set    → a hand put it there, and it stays exactly there.
--
-- World units are board pixels at zoom 1 (lib/studio/surface.ts). Additive:
-- every existing read is `select *` and every existing insert gets null.
-- ============================================================================

alter table studio_nodes add column if not exists board_x integer;
alter table studio_nodes add column if not exists board_y integer;

alter table studio_threads add column if not exists board_x integer;
alter table studio_threads add column if not exists board_y integer;

-- Where the project's own title + vision + rules block sits. One per
-- project, so it lives directly on studio_projects rather than a table.
alter table studio_projects add column if not exists vision_x integer;
alter table studio_projects add column if not exists vision_y integer;

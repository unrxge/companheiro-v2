-- ============================================================================
-- 029_the_desk.sql — where a project sits on the shelf
--
-- The shelf (level 3) is a desk, not a grid: projects lie where the person put
-- them, at whatever angle the hand left them. Only two numbers are needed for
-- that, and they are nullable on purpose —
--
--   null  → never moved by hand. The desk lays it out on the aligned grid, so
--           a new project always arrives straight and nothing is ever lost
--           off-screen.
--   set   → the person placed it. The desk puts it back exactly there.
--
-- World units are desk pixels at zoom 1, clamped client-side to the desk's
-- bounds (lib/studio/surface.ts). Additive: every existing read is `select *`
-- and every existing insert gets null, which means "not placed yet".
-- ============================================================================

alter table studio_projects add column if not exists shelf_x integer;
alter table studio_projects add column if not exists shelf_y integer;

-- Add a "queued" piece stage, used when a piece that was activated gets sent
-- back to the Queue column (dragged backward) so it stops appearing as
-- in-progress in Active while its draft/tasks are preserved.
alter type piece_stage add value 'queued';

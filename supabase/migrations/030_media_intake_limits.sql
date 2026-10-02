-- 030_media_intake_limits.sql — what the studio-media bucket will take.
--
-- Two changes, both about files people actually have:
--
--  * SIZE. The bucket was capped at 25 MB, which is a short WAV and not much
--    of a recording. Photographs no longer need the room — every picture is
--    now downsized in the browser before it is sent, to a long edge of 2560
--    and about 3 MB — so the allowance goes to audio instead: 50 MB, roughly
--    45 minutes of MP3 or four of uncompressed WAV.
--
--  * TYPES. Only the audio list grows. Camera RAW, TIFF and HEIC are read in
--    the browser (through the JPEG preview the camera wrote inside the file,
--    for the ones no browser decodes) and arrive here as WebP or JPEG, so the
--    image list already covers them and does not need widening.
--
-- Safe to run more than once. Nothing else is touched, and no row changes.

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    -- images, as the browser prepares them
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    -- audio, as people have it
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav',
    'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/aac', 'audio/flac',
    'audio/x-m4a', 'audio/m4a'
  ]
where id = 'studio-media';

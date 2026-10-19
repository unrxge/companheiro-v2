import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanUrl, embedFor } from './embed'

test('cleanUrl fills the scheme and refuses what is not a web link', () => {
  assert.equal(cleanUrl('youtube.com/watch?v=abcdefghijk'), 'https://youtube.com/watch?v=abcdefghijk')
  assert.equal(cleanUrl('javascript:alert(1)'), null)
  assert.equal(cleanUrl('not a link'), null)
  assert.equal(cleanUrl('localhost'), null)
})

test('YouTube in its several shapes plays inside', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) {
    const e = embedFor(u)
    assert.equal(e.kind, 'video')
    assert.match(e.src ?? '', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  }
  assert.equal(embedFor('https://youtube.com/shorts/dQw4w9WgXcQ').ratio, 9 / 16)
  assert.match(embedFor('https://youtu.be/dQw4w9WgXcQ?t=42').src ?? '', /start=42/)
})

test('Vimeo, Spotify, SoundCloud and files', () => {
  assert.equal(embedFor('https://vimeo.com/123456789').src, 'https://player.vimeo.com/video/123456789')
  assert.equal(embedFor('https://open.spotify.com/track/abc123').src, 'https://open.spotify.com/embed/track/abc123')
  assert.equal(embedFor('https://soundcloud.com/artist/song').kind, 'audio')
  assert.equal(embedFor('https://x.com/a.mp4').media, true)
  assert.equal(embedFor('https://x.com/a.mp3').kind, 'audio')
  assert.equal(embedFor('https://x.com/a.png').kind, 'image')
})

test('anything else is a page', () => {
  const e = embedFor('https://www.example.com/article')
  assert.equal(e.kind, 'page')
  assert.equal(e.host, 'example.com')
})

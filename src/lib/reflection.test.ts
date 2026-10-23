import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  THEMES, allowedThemes, cleanHeard, continuationLines, emptyHeard, hasAnyLog, logFromHeard, nextTheme, parseLog, parseReflectTurn,
  personFirst, reflectOpening, reflectStableBlock, reflectTool, reflectVolatileBlock, toLogBody, type Heard,
} from './reflection'

const heard = (over: Partial<Heard> = {}): Heard => ({ ...emptyHeard(), ...over })
const progress = (over: Partial<{ phase: number; followedUp: number[]; skipped: number[] }> = {}) => ({ phase: 1, followedUp: [] as number[], skipped: [] as number[], ...over })

test('the four things are asked in order', () => {
  assert.deepEqual(nextTheme(heard({ feeling: 'Relieved' }), progress({ phase: 1 })), { theme: 2, followUp: false })
  assert.deepEqual(nextTheme(heard({ feeling: 'Relieved', opened: 'A question' }), progress({ phase: 2 })), { theme: 3, followUp: false })
})

test('an answer with nothing to write down is pressed once, then let go', () => {
  assert.deepEqual(nextTheme(heard(), progress({ phase: 1 })), { theme: 1, followUp: true })
  // pressed already, still nothing: on to the next, and never back
  assert.deepEqual(nextTheme(heard(), progress({ phase: 1, followedUp: [1] })), { theme: 2, followUp: false })
  assert.deepEqual(nextTheme(heard(), progress({ phase: 2, followedUp: [1, 2] })), { theme: 3, followUp: false })
})

test('an honest "nothing" counts as an answer', () => {
  assert.deepEqual(nextTheme(heard({ feeling: 'Calm', opened: 'x', unresolved: 'Nothing left unresolved.' }), progress({ phase: 3 })), { theme: 4, followUp: false })
})

test('what was said about a later thing while answering an earlier one is not asked again', () => {
  const h = heard({ feeling: 'Tired', next: 'A shorter version' })
  assert.deepEqual(nextTheme(h, progress({ phase: 1 })), { theme: 2, followUp: false })
  assert.deepEqual(nextTheme(heard({ feeling: 'Tired', opened: 'o', unresolved: 'u', next: 'n' }), progress({ phase: 3 })), { theme: null, followUp: false })
})

test('a skipped thing is never asked, and skipping them all leaves nothing', () => {
  assert.deepEqual(nextTheme(heard(), progress({ phase: 1, skipped: [1] })), { theme: 2, followUp: false })
  assert.deepEqual(nextTheme(heard(), progress({ phase: 4, skipped: [1, 2, 3, 4] })), { theme: null, followUp: false })
})

test('after a correction (phase 0) only what is still open is asked', () => {
  const all = heard({ feeling: 'a', opened: 'b', unresolved: 'c', next: 'd' })
  assert.equal(nextTheme(all, progress({ phase: 0 })).theme, null)
  assert.equal(nextTheme(heard({ feeling: 'a' }), progress({ phase: 0 })).theme, 2)
})

test('the model is only offered what is still open, plus the one it may press', () => {
  assert.deepEqual(allowedThemes(heard({ feeling: 'x' }), progress({ phase: 1 })), [2, 3, 4])
  assert.deepEqual(allowedThemes(heard(), progress({ phase: 2, followedUp: [1] })), [2, 3, 4])
  assert.deepEqual(allowedThemes(heard({ feeling: 'a', opened: 'b', unresolved: 'c', next: 'd' }), progress({ phase: 0 })), [])
  const tool = reflectTool([])
  assert.deepEqual((tool.input_schema.properties.asking as { enum: number[] }).enum, [5])
})

test('a turn says what was heard, then asks the due thing', () => {
  const turn = parseReflectTurn(
    { heard: { feeling: 'Relieved, mostly', opened: '', unresolved: '', next: '' }, asking: 2, reflection: 'Relief, with something still humming under it.', question: 'What did making it open up in you?' },
    progress({ phase: 1 }),
  )
  assert.ok(turn)
  assert.equal(turn.theme, 2)
  assert.equal(turn.done, false)
  assert.match(turn.say, /^Relief, with something/)
  assert.match(turn.say, /open up in you\?$/)
})

test('if the model asks about the wrong thing, the plain question for the due one is used', () => {
  const turn = parseReflectTurn(
    { heard: { feeling: 'Fine', opened: '', unresolved: '', next: '' }, asking: 4, reflection: 'OK.', question: 'Where could it go next?' },
    progress({ phase: 1 }),
  )
  assert.ok(turn)
  assert.equal(turn.theme, 2)
  assert.ok(turn.say.endsWith(THEMES[1].ask))
})

test('pressing once is flagged so the page can count it', () => {
  const turn = parseReflectTurn({ heard: emptyHeardRaw(), asking: 1, reflection: 'That is hard to put a word to.', question: 'What was the last thing you felt when you stopped?' }, progress({ phase: 1 }))
  assert.ok(turn)
  assert.equal(turn.followUp, true)
  assert.equal(turn.theme, 1)
})

test('nothing left means close, with no question', () => {
  const full = { feeling: 'a', opened: 'b', unresolved: 'c', next: 'd' }
  const turn = parseReflectTurn({ heard: full, asking: 5, reflection: 'That is a whole picture.', question: 'Anything else?' }, progress({ phase: 4 }))
  assert.ok(turn)
  assert.equal(turn.done, true)
  assert.equal(turn.theme, 0)
  assert.equal(turn.say, 'That is a whole picture.')
})

test('a malformed call gives nothing rather than something invented', () => {
  assert.equal(parseReflectTurn(null, progress()), null)
  assert.equal(parseReflectTurn('x', progress()), null)
  assert.deepEqual(cleanHeard({ feeling: 5, opened: ' ok ' }), { feeling: '', opened: 'ok', unresolved: '', next: '' })
})

test('the prompt never lets sharing or quality in, and closed things are named closed', () => {
  const stable = reflectStableBlock('TONE')
  assert.match(stable, /Never ask about posting, sharing, publishing/)
  assert.match(stable, /never yours to say/)
  const volatile = reflectVolatileBlock({ heard: heard({ feeling: 'Calm' }), progress: progress({ phase: 1 }), piece: { title: 'The kettle', core_truth: 'Being needed is not being alive.' } })
  assert.match(volatile, /Calm/)
  assert.match(volatile, /The kettle/)
  assert.doesNotMatch(volatile, /\n1\. HOW THEY FEEL/)
})

test('the opening is about this piece and asks how they feel', () => {
  assert.match(reflectOpening('The kettle'), /^“The kettle” is finished\. How are you feeling/)
  assert.match(reflectOpening('Untitled'), /^It is finished\./)
})

test('the conversation always opens on a person, as the API needs', () => {
  assert.equal(personFirst([]).length, 1)
  assert.equal(personFirst([{ role: 'assistant', content: 'hi' }])[0].role, 'user')
})

test('the log is written in the table\'s old shape, and a failed write-up falls back to what was heard', () => {
  const log = parseLog({ feeling: ' Relieved ', opened: 'x', unresolved: 'Nothing left unresolved.', next: ['a shorter version', '', 'a letter'] })
  assert.ok(log)
  assert.deepEqual(toLogBody(log), { feeling: 'Relieved', what_it_opened: 'x', unresolved: 'Nothing left unresolved.', natural_continuations: 'a shorter version\na letter' })
  assert.deepEqual(logFromHeard(heard({ feeling: 'Calm', next: '- one\n- two' })).next, ['one', 'two'])
  assert.equal(hasAnyLog(parseLog({ feeling: '', opened: '', unresolved: '', next: [] })!), false)
  assert.deepEqual(continuationLines('- a\n\n2. b'), ['a', 'b'])
})

function emptyHeardRaw() {
  return { feeling: '', opened: '', unresolved: '', next: '' }
}

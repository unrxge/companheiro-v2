import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRIEF_FIRST_QUESTION,
  BRIEF_OPENING,
  BRIEF_FOLLOW_UPS,
  briefFloor,
  canFollowUp,
  briefProjectContext,
  briefStableBlock,
  briefStorageKey,
  briefTool,
  briefVolatileBlock,
  parseBriefTurn,
  personFirst,
} from './concept-brief'

const turn = (o: Record<string, unknown>) => ({ settled: [], question: '', say_back: '', ...o })

test('the page opens on the question the first stage is told was asked', () => {
  assert.ok(BRIEF_OPENING.endsWith(BRIEF_FIRST_QUESTION))
  assert.ok(briefVolatileBlock({ phase: 1 }).includes(`asked as "${BRIEF_FIRST_QUESTION}"`))
})

test('a stage just answered may be asked once more, at most twice in a brief, then the brief moves on', () => {
  assert.equal(briefFloor(1, []), 1)
  assert.equal(briefFloor(1, [1]), 2)
  assert.equal(briefFloor(2, [1]), 2)
  assert.equal(briefFloor(3, [1, 2]), 4)
  assert.equal(briefFloor(4, [1, 3]), 5)
  assert.equal(BRIEF_FOLLOW_UPS, 2)
  assert.equal(canFollowUp(2, []), true)
  assert.equal(canFollowUp(2, [2]), false)
  assert.equal(canFollowUp(3, [1, 2]), false)
  assert.equal(canFollowUp(5, []), false)
})

test('the last stage stays the last: what follows the say-back is a correction', () => {
  assert.equal(briefFloor(5), 5)
  assert.equal(briefFloor(5, [1]), 5)
})

test('a brief that skipped ahead is never held back', () => {
  // One rich answer, and the model asked stage 3: the next line asks 3 again at most, never 1 or 2.
  assert.equal(briefFloor(3, []), 3)
  assert.equal(briefFloor(3, [1, 2]), 4)
})

test('the one call can only ask a stage that is still allowed', () => {
  const stages = (floor: number) => (briefTool(floor).input_schema.properties.asking as { enum: number[] }).enum
  assert.deepEqual(stages(1), [1, 2, 3, 4, 5])
  assert.deepEqual(stages(3), [3, 4, 5])
  assert.deepEqual(stages(5), [5])
  assert.deepEqual(stages(0), [1, 2, 3, 4, 5])
  assert.deepEqual(stages(9), [5])
})

test('the one call has every field, in the order the reasoning should run', () => {
  const tool = briefTool(1)
  assert.equal(tool.name, 'brief_turn')
  assert.deepEqual(Object.keys(tool.input_schema.properties), ['settled', 'root', 'asking', 'question', 'say_back'])
  assert.deepEqual(tool.input_schema.required, ['settled', 'root', 'asking', 'question', 'say_back'])
})

test('once everything is asked there is no field to put a question in', () => {
  for (const floor of [5, 6]) {
    const tool = briefTool(floor)
    assert.deepEqual(Object.keys(tool.input_schema.properties), ['settled', 'root', 'asking', 'say_back'])
    assert.deepEqual(tool.input_schema.required, ['settled', 'root', 'asking', 'say_back'])
  }
  // One stage short of it still has the question.
  assert.ok('question' in briefTool(4).input_schema.properties)
})

test('the stage the line asks is the stage the page moves to, and the line is the question alone', () => {
  const t = parseBriefTurn(turn({ settled: [1], asking: 2, question: 'What should have changed by the end?' }), { phase: 1, floor: 2 })
  assert.deepEqual(t, { say: 'What should have changed by the end?', phase: 2, followUp: false, readyToAdvance: false, phaseComplete: true })
})

test('whatever the model puts beside the question, only the question is shown', () => {
  const t = parseBriefTurn({ settled: [1], asking: 3, ack: 'Right, the newsletter.', question: '  Who is it for?  ', say_back: '' }, { phase: 2, floor: 3 })
  assert.equal(t?.say, 'Who is it for?')
})

test('an answer that covered everything goes straight to saying it back', () => {
  const t = parseBriefTurn(turn({ settled: [1, 2, 3, 4], asking: 5, say_back: 'So: an essay for people about to leave a job.' }), { phase: 1, floor: 1 })
  assert.deepEqual(t, { say: 'So: an essay for people about to leave a job.', phase: 5, followUp: false, readyToAdvance: true, phaseComplete: true })
})

test('asking the same stage again is a follow-up, and is not progress', () => {
  const t = parseBriefTurn(turn({ asking: 1, question: 'What is it about?' }), { phase: 1, floor: 1 })
  assert.equal(t?.phase, 1)
  assert.equal(t?.phaseComplete, false)
  assert.equal(t?.followUp, true)
  const next = parseBriefTurn(turn({ asking: 2, question: 'Who is it for?' }), { phase: 1, floor: 1 })
  assert.equal(next?.followUp, false)
})

test('a model that asks a stage again is moved on, not obeyed', () => {
  const t = parseBriefTurn(turn({ asking: 2, question: 'Say a bit more about where it ends up?' }), { phase: 2, floor: 3 })
  assert.equal(t?.phase, 3)
})

test('a stage past the last, or none at all, lands somewhere sensible', () => {
  assert.equal(parseBriefTurn(turn({ asking: 9, question: 'x?' }), { phase: 1, floor: 2 })?.phase, 5)
  assert.equal(parseBriefTurn(turn({ question: 'x?' }), { phase: 2, floor: 3 })?.phase, 3)
  assert.equal(parseBriefTurn(turn({ asking: 'three', question: 'x?' }), { phase: 2, floor: 3 })?.phase, 3)
  assert.equal(parseBriefTurn(turn({ asking: 3.6, question: 'x?' }), { phase: 2, floor: 3 })?.phase, 4)
})

test('a say-back is the last stage, whatever stage it was called', () => {
  const t = parseBriefTurn(turn({ asking: 3, say_back: 'Here is what I heard.' }), { phase: 2, floor: 3 })
  assert.deepEqual(t, { say: 'Here is what I heard.', phase: 5, followUp: false, readyToAdvance: true, phaseComplete: true })
})

test('on the last stage a question is shown rather than nothing', () => {
  const t = parseBriefTurn(turn({ asking: 5, question: 'Anything to add?' }), { phase: 5, floor: 5 })
  assert.equal(t?.say, 'Anything to add?')
  assert.equal(t?.phase, 5)
})

test('a correction after the say-back stays on the last stage and stays ready', () => {
  const t = parseBriefTurn(turn({ asking: 5, say_back: 'Here it is, shorter.' }), { phase: 5, floor: 5 })
  assert.deepEqual(t, { say: 'Here it is, shorter.', phase: 5, followUp: false, readyToAdvance: true, phaseComplete: false })
})

test('a turn with no question and no say-back is nothing to show', () => {
  assert.equal(parseBriefTurn(null, { phase: 1, floor: 1 }), null)
  assert.equal(parseBriefTurn(turn({ asking: 2 }), { phase: 1, floor: 1 }), null)
  assert.equal(parseBriefTurn(turn({ asking: 2, question: '   ' }), { phase: 1, floor: 1 }), null)
  assert.equal(parseBriefTurn('words', { phase: 1, floor: 1 }), null)
})

test('a person speaks first to the model, and the page never has to show it', () => {
  const opened = personFirst([{ role: 'assistant' as const, content: BRIEF_OPENING }, { role: 'user' as const, content: 'A letter.' }])
  assert.equal(opened.length, 3)
  assert.equal(opened[0].role, 'user')
  assert.equal(opened[1].content, BRIEF_OPENING)
  const already = [{ role: 'user' as const, content: 'A letter.' }]
  assert.equal(personFirst(already), already)
  assert.equal(personFirst([]).length, 1)
})

test('a stage with a follow-up left may be asked once more, only for what makes it theirs', () => {
  const v = briefVolatileBlock({ phase: 1 })
  assert.match(v, /Stage 1 has just been answered/)
  assert.match(v, /could belong to a hundred other projects/)
  assert.match(v, /with asking 1/)
  assert.match(v, /1\. WHAT IT IS FOR/)
  assert.match(briefVolatileBlock({ phase: 2, followedUp: [1] }), /the last follow-up this brief has/)
})

test('after that the answered stage is taken as it stands and only later stages are offered', () => {
  const v = briefVolatileBlock({ phase: 1, followedUp: [1] })
  assert.match(v, /Stage 1 has been asked and they have answered it/)
  assert.match(v, /do not ask it again/)
  assert.doesNotMatch(v, /1\. WHAT IT IS FOR/)
  assert.match(v, /2\. WHERE IT IS HEADED/)
  assert.match(v, /5\. SAYING IT BACK/)
  assert.match(v, /closed for good/)
})

test('reaching the last stage offers only the saying back, and says everything is asked', () => {
  const v = briefVolatileBlock({ phase: 4, followedUp: [1, 2] })
  assert.match(v, /Stage 4 has been asked and they have answered it/)
  assert.match(v, /5\. SAYING IT BACK/)
  assert.doesNotMatch(v, /4\. WHAT IT IS REALLY ABOUT/)
  assert.match(v, /Everything is asked: say it back/)
  assert.doesNotMatch(v, /have said it back, and they have written after it/)
})

test('after the say-back what is written is a correction, with nothing more to ask', () => {
  const v = briefVolatileBlock({ phase: 5 })
  assert.match(v, /THE LAST STAGE/)
  assert.match(v, /You have said it back, and they have written after it/)
  assert.match(v, /correction or something to add/)
  assert.match(v, /asking 5/)
})

test('the stable prompt asks for a root with common sense, and never for detail for its own sake', () => {
  const s = briefStableBlock('TONE')
  assert.match(s, /^You are Companheiro, taking a short brief/)
  assert.match(s, /\nTONE\n/)
  assert.match(s, /common sense/)
  assert.match(s, /what makes this one theirs/)
  assert.match(s, /never ask for the plot/)
  assert.match(s, /Never ask the same stage a third time/)
  assert.match(s, /stock phrase/)
  assert.match(s, /in the language they write in/)
  assert.match(s, /brief_turn/)
})

test('the overlap between where it is headed and who it is for is named, so one settles the other', () => {
  assert.match(briefVolatileBlock({ phase: 1 }), /answers this too, so one settles the other/)
})

test('what the project already says is held, not asked again; an untitled, empty one says nothing', () => {
  assert.equal(briefProjectContext(null), '')
  assert.equal(briefProjectContext({ title: 'Untitled', intent: '' }), '')
  assert.equal(briefProjectContext({ title: '  untitled ', intent: '   ' }), '')
  const named = briefProjectContext({ title: 'Letters to my father', intent: 'A run of letters I never sent.' })
  assert.match(named, /Title: Letters to my father/)
  assert.match(named, /Written when they started it: A run of letters I never sent\./)
  assert.match(named, /Do not ask for any of this again/)
  // "Untitled" is not a name worth quoting back.
  assert.doesNotMatch(briefProjectContext({ title: 'Untitled', intent: 'A run of letters.' }), /Title:/)
})

test('the project text is part of what the model sees each turn', () => {
  const v = briefVolatileBlock({ phase: 2, project: { title: 'Untitled', intent: 'A run of letters.' } })
  assert.match(v, /WHAT THE PROJECT ALREADY SAYS/)
  assert.match(v, /A run of letters\./)
})

test('a long first paragraph is clipped before it goes into the prompt', () => {
  const ctx = briefProjectContext({ title: 'T', intent: 'x'.repeat(5000) })
  assert.ok(ctx.length < 1800)
})

test('each project keeps its own unfinished brief', () => {
  assert.notEqual(briefStorageKey('a'), briefStorageKey('b'))
})

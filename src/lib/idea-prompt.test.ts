import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIdeaPrompt, overallRegister, promptModelTier, type TerritoryInput } from './idea-prompt'

const field: TerritoryInput = { key: 'f', label: 'Documentary editing', custom: true, register: 'field', rangeMap: 'Assembling footage into an argument.', facetSeeds: ['the paper cut — what it leaves unwatched'] }
const unsorted: TerritoryInput = { key: 'u', label: 'What I keep making', custom: true }
const base = { arcs: ['Breakaway'], energy: 'steady', impersonal: true, facetSeed: null, rejected: [], groundingBlock: '', makes: '' }

test('the first question and two more are fast, then three deep, three fast, and so on', () => {
  const tiers = Array.from({ length: 13 }, (_, n) => promptModelTier(n))
  assert.deepEqual(tiers, ['fast', 'fast', 'fast', 'deep', 'deep', 'deep', 'fast', 'fast', 'fast', 'deep', 'deep', 'deep', 'fast'])
  assert.equal(promptModelTier(NaN), 'fast')
})

test('a territory with no register is an inner one, as every territory used to be', () => {
  assert.equal(overallRegister([]), 'inner')
  assert.equal(overallRegister(['slow_living_life_in_service', unsorted]), 'inner')
  assert.equal(overallRegister([field]), 'field')
  assert.equal(overallRegister([field, 'slow_living_life_in_service']), 'mixed')
})

test('a field is asked about as a field, not as inner life', () => {
  const built = buildIdeaPrompt({ ...base, territories: [field], makes: 'Cinematographer' })
  assert.equal(built.register, 'field')
  assert.match(built.system, /concrete creative field/)
  assert.match(built.system, /WHAT THEY MAKE: Cinematographer/)
  assert.doesNotMatch(built.system, /universal human experience/)
  assert.match(built.userMessage, /^Generate a question about the field/)
})

test('an inner territory still gets the original prompt, and a mixed one stands on the field', () => {
  const inner = buildIdeaPrompt({ ...base, territories: ['slow_living_life_in_service'] })
  assert.equal(inner.register, 'inner')
  assert.match(inner.system, /^You are Companheiro, generating a prompt that opens a door into the writer's relationship with the world\./)
  assert.doesNotMatch(inner.system, /MIXED GROUND/)
  const mixed = buildIdeaPrompt({ ...base, territories: ['slow_living_life_in_service', field] })
  assert.match(mixed.system, /MIXED GROUND: Documentary editing is a concrete field/)
})

test('every question turned down is named, so the next one does not circle back', () => {
  const one = buildIdeaPrompt({ ...base, territories: [field], rejected: ['First?'] })
  assert.match(one.system, /THE PREVIOUS PROMPT WAS REJECTED:\n"First\?"/)
  const three = buildIdeaPrompt({ ...base, territories: [field], rejected: ['First?', 'Second?', 'Third?'] })
  assert.match(three.system, /- "First\?"\n- "Second\?"\n- "Third\?"/)
})

import { MODELS } from './models'

// Chooses how much model to bring to a check-in turn.
//
// ONE RULE GOVERNS THIS FILE: it can only ever escalate. A false positive
// costs a fraction of a cent; a false negative just means the fast model
// handles the turn, which is what happened before this existed. Nothing here
// filters, suppresses, or changes a single word the person sees — it decides
// capability, nothing else.
//
// Do NOT repurpose this as a safety classifier. The crisis path lives in the
// prompt, is read by the model from the actual content, and applies in every
// language whether or not a word below happened to match. If this function
// misses something, the crisis instructions still fire; the turn is just
// answered by a smaller model. Treating this list as the thing that catches
// crises would be a serious mistake.

// Words that suggest the moment is delicate enough to be worth reading
// accurately. Deliberately broad — grief, rupture and fear belong here as much
// as danger does, because those are exactly the moments where a flattened,
// one-register reply does the most harm.
//
// Coverage is best-effort and English-heavy, with the languages this is most
// likely to meet next. It will miss plenty, in plenty of languages: that is a
// known and acceptable limitation given the failure mode is "answered by the
// fast model", not "unhandled".
const DELICATE_MARKERS = [
  // English — danger and acute distress
  'kill myself', 'killing myself', 'suicide', 'suicidal', 'end my life', 'want to die',
  'better off dead', 'self harm', 'self-harm', 'hurt myself', 'hurting myself',
  'no reason to live', "can't go on", 'cant go on', "can't do this anymore",
  'overdose', 'panic attack', 'breakdown', 'hopeless', 'worthless',
  // English — rupture, loss, harm from others
  'died', 'death', 'funeral', 'terminal', 'diagnosis', 'cancer', 'miscarriage',
  'divorce', 'left me', 'hitting me', 'abusive', 'abused', 'assault', 'relapse',
  // Portuguese
  'suicídio', 'suicidio', 'me matar', 'matar-me', 'acabar com tudo',
  'não aguento', 'nao aguento', 'sem saída', 'sem saida', 'morreu', 'faleceu',
  // Spanish
  'suicidarme', 'matarme', 'acabar con todo', 'no aguanto', 'sin salida', 'murió', 'murio',
  // French
  'me tuer', 'en finir', 'jen peux plus', "j'en peux plus", 'est mort', 'décédé', 'decede',
]

function readsDelicate(text: string): boolean {
  const lower = text.toLowerCase()
  return DELICATE_MARKERS.some((m) => lower.includes(m))
}

/** A message long enough to be someone actually saying something. */
const SUBSTANTIAL_CHARS = 120
/** An opening entry dense enough that misreading it is the real risk. */
const DENSE_ENTRY_CHARS = 500

export interface RoutingInput {
  /** What they just wrote, this turn only. */
  currentText: string
  /** What they wrote the turn before, if any. Provides the decay window. */
  previousText?: string
  /** Energy from the most recent reading, which is revised every turn. */
  energy?: 'low' | 'medium' | 'high' | null
}

/**
 * The fast model handles the ordinary check-in well and cheaply. This lifts to
 * the deeper model where the extra judgment buys something — and drops back
 * when it stops buying anything.
 *
 * Everything is measured on the CURRENT moment plus the turn before it, never
 * on the accumulated session. That one-turn window is deliberate: it gives an
 * escalation enough stickiness not to evaporate because someone answered a
 * hard question with three words, while still letting a conversation that has
 * genuinely lightened come back down. Nothing here latches — a check-in that
 * opens heavy and resolves into something ordinary should stop costing what
 * heavy costs, and a single difficult word should not pin the rest of the
 * session to the expensive model.
 */
export function modelForCheckIn({ currentText, previousText = '', energy = null }: RoutingInput): string {
  const current = currentText.trim()
  // The decay window: this turn and the one before it, nothing older.
  const recent = `${previousText}\n${current}`

  // Delicate material anywhere in the window. Decays one turn after the
  // subject actually changes, rather than persisting for the whole session.
  if (readsDelicate(recent)) return MODELS.deep
  // Someone came with a lot in one go. Misreading that is the failure mode.
  if (current.length > DENSE_ENTRY_CHARS) return MODELS.deep
  // Still in deep water right now — both of the last two turns carried real
  // weight. Being far into a conversation is not itself the trigger; being in
  // a substantial exchange is, and that condition can stop being true.
  if (current.length >= SUBSTANTIAL_CHARS && previousText.trim().length >= SUBSTANTIAL_CHARS) {
    return MODELS.deep
  }
  // Depleted is the state most often mishandled by a single stern register.
  // Re-read every turn, so it lifts as they do.
  if (energy === 'low') return MODELS.deep

  return MODELS.fast
}

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

export interface RoutingInput {
  /** Everything the person has written this session, newest included. */
  text: string
  /** Substantive user turns so far — the excavation phase needs nuance most. */
  substantiveTurns?: number
  /** Energy from the reading so far, when there is one. */
  energy?: 'low' | 'medium' | 'high' | null
}

/**
 * The fast model handles the ordinary check-in well and cheaply. This lifts to
 * the deeper model only where the extra judgment actually buys something:
 * delicate material, a conversation that has gone somewhere, a dense entry
 * that has to be read accurately, or someone with nothing left in the tank.
 */
export function modelForCheckIn({ text, substantiveTurns = 0, energy = null }: RoutingInput): string {
  if (readsDelicate(text)) return MODELS.deep
  // Past the second real turn this is no longer a check-in, it is a
  // conversation with something in it — which is where calibration between
  // pressing and holding gets hard, and where a flattened reply costs most.
  if (substantiveTurns >= 2) return MODELS.deep
  // A long entry is someone who came with a lot. Misreading it is the failure.
  if (text.trim().length > 500) return MODELS.deep
  // Depleted is the state most often mishandled by the single stern register.
  if (energy === 'low') return MODELS.deep
  return MODELS.fast
}

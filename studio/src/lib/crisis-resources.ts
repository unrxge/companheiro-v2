// Routing for the crisis path in COMPANION_TONE.
//
// Deliberately country-agnostic. This app has no reliable signal for where
// someone physically is (locale and language are hints, not location, and a
// Portuguese speaker may be anywhere), and a wrong emergency number handed to
// someone in danger is worse than no number at all. So the model is never
// asked to recall a national line from memory — that is exactly the situation
// where a hallucinated digit does real harm.
//
// Three routes, in the order a person can actually use them:
//   1. A person they trust, now — works everywhere, needs no lookup.
//   2. Emergency services, if there is immediate danger to life.
//   3. A directory that resolves the right line for their own country.
//
// REVIEW PERIODICALLY: this URL is the one external dependency on this path.
// Find A Helpline (ThroughLine) lists vetted services for 130+ countries and
// detects the visitor's country itself. Verify it still resolves before
// relying on it, and swap it here if it ever stops being maintained.
export const CRISIS_DIRECTORY_URL = 'https://findahelpline.com'

export const CRISIS_ROUTING = `Routing, in this order — never as a list, never as a wall of text, just whichever one fits what they have told you:
- A person they trust, tonight. This works in every country, needs no lookup, and is usually the right first ask.
- Emergency services, if there is immediate danger to their life. Do NOT recite a specific emergency number unless they have told you where they are and you are certain it is correct — say "your local emergency number" instead. A wrong number here costs more than a vague one.
- ${CRISIS_DIRECTORY_URL} — a directory that finds the crisis line for their own country. Offer it as somewhere to go, not as a way to end the conversation.

Never invent a helpline name, number, or opening hours. If you are not certain of a specific service, do not name one.`

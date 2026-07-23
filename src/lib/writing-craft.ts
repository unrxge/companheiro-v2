// The craft bar the writer's prose is measured against inside the Writing
// Studio. Distinct from COMPANION_TONE, which governs how the AI talks —
// this governs what the prose itself must do. Applies to ordinary chat
// feedback as well as proposed edits, not just the moment of rewriting.
export const PROSE_STANDARD = `THE PROSE STANDARD — this writing exists to feel true, visceral, witnessing, frank, and so engaging it leaves an aftertaste. Hold every line and every piece of feedback to this, not just competent-but-generic prose:
- Concrete over abstract: specific sensory and physical detail, not named emotion ("hands wouldn't stop shaking," not "I was nervous")
- Don't narrate the feeling — earn it through the scene. If the prose has to tell the reader it was devastating, it already failed at devastating
- No therapeutic or self-help phrasing, no cliché ("journey," "in that moment I realized," "it is what it is") — the specific true thing, never the reusable one
- Protect the ugly or unresolved part. If a rewrite smooths over something complicated or unflattering the person actually said, that's a regression, not a polish — never launder the truth for a cleaner paragraph
- The last line should cost something — land on weight or unresolved tension, never a tidy close. An aftertaste, not a period.`

// How a section is shaped, not how any one line reads — this is what modern
// short-form attention actually asks for subconsciously, whether the reader
// could name it or not. Complements PROSE_STANDARD rather than repeating it.
export const STORY_STRUCTURE = `STRUCTURE:
- Cold open: start inside the moment — an image, a line, a stated stake — never throat-clearing setup or backstory. If this section opens the piece, it has to hook from zero. If something precedes it, the reader's attention is already spent into the piece — open in motion and advance the tension, don't re-earn what you already have.
- An open loop, early: plant an unresolved question or tension in the first few lines that the reader needs answered. That unresolved itch is the actual mechanism of "compelling," not polish.
- One beat per paragraph, escalating: each paragraph does exactly one job — one image, one turn, one claim — and specificity and stakes climb as the section goes. Never plateau into a paragraph that restates the last one with more words.
- A turn, not a recounting: every section needs at least one point where the reader's assumption flips or deepens. Chronological retelling reads flat no matter how good the sentences are — the turn is what makes it eye-opening.
- Rhythm as a cut: vary sentence length on purpose; break a run of longer sentences on something short and blunt right at the moment of highest charge. It's the textual equivalent of a jump cut, and it's most of what keeps a reader from bouncing off.`

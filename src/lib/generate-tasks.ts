import { anthropic } from './anthropic'
import { MODELS } from './models'
import { logUsage } from './usage-log'

export interface CoreConcept {
  one_sentence: string
  arc: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
  writing_goals: string
  open_threads?: string[]
}

export interface GeneratedTask {
  title: string
}

/** A sanity stop, not a target: the journey itself is capped at nine beats. */
const CEILING = 9

/** What the generator is shown of the concept. */
export function summariseConcept(concept: CoreConcept): string {
  const threads = (concept.open_threads ?? []).filter((x) => x && x.trim())
  return `Idea: ${concept.one_sentence}
Conviction: ${concept.conviction_statement}
Core truth: ${concept.core_truth}
Emotional journey (one beat per line):
${concept.emotional_journey || '(none)'}
Writing suggestions:
${concept.writing_goals || '(none)'}
Open threads:
${threads.length ? threads.map((x) => `- ${x}`).join('\n') : '(none)'}`
}

export const TASK_PROMPT = `You turn a locked core concept into the few writing tasks that get its author out of the abstract and into the draft. The piece may be prose, a script, a song or something else; "writing" means making its words.

These are places to start, not a checklist the piece must satisfy. The author will see them as suggestions and can delete any of them. A list that reads like a project plan makes people feel behind before they begin, so every task has to earn its place.

A task earns its place only if all three are true:
1. It is a move in the writing itself: finding, drafting or deciding something on the page.
2. It comes from something specific in THIS concept, and says so in the concept's own words.
3. It can be done in one sitting.

Where tasks come from, in this order:
- THE WAY IN. Exactly one: the smallest concrete first move, usually the moment the first beat opens on. This is always the first task.
- BEATS THAT ARE STILL ABSTRACT. Go through the emotional journey beat by beat. A beat that names a feeling or a turn without a concrete moment, scene or image to carry it gets one task: find that moment. A beat that already carries its moment gets nothing. Never one task per beat by default.
- OPEN THREADS THE DRAFT CANNOT BE WRITTEN AROUND. An open thread gets one task only if leaving it undecided would stall the draft (who is speaking, what actually happened, where it ends). A thread that can stay open while writing gets nothing.
- A WRITING SUGGESTION THAT NEEDS ITS OWN PASS. Only when it asks for a separate read of the draft (for example, cutting every line that explains the feeling). A suggestion that is a habit to hold while writing gets nothing.

Never write a task for:
- anything that is not the writing: research, visuals, titles for publishing, formatting, scheduling, promotion, sharing
- steps the app already has after the draft: rereading it as a whole, testing it, reimagining it, editing or proofreading it, publishing it, reflecting on it
- restating a beat as "write the section about…"; the sections already exist
- general craft advice that would be true of any piece

How many: as many as the rules above produce, and no more. A concept whose beats are already concrete, with nothing left open, may need two. A concept that is still mostly feeling, with several things undecided, may need seven or eight. Do not pad a short list and do not trim a long one to look tidy. Never more than ${CEILING}.

Each title: starts with a verb, names the specific thing in the author's own words, under fourteen words, no numbering.

Return only JSON: { "tasks": [ { "title": "..." } ] }`

// The writing tasks for a newly locked piece. They are a way out of the
// abstract and into the draft, not a definition of done: each one has to come
// from something in this concept, so how many there are follows the concept
// and not a quota. Everything that isn't the writing (research, visuals,
// publishing, promotion) is the person's own to add, under their own headings.
export async function generateTasks(userId: string, concept: CoreConcept): Promise<GeneratedTask[]> {
  const conceptSummary = summariseConcept(concept)

  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 1200,
      system: TASK_PROMPT,
      messages: [{ role: 'user', content: conceptSummary }],
    })

    logUsage(userId, 'lib/generate-tasks', response.model, response.usage)

    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') return []

    const cleanedText = textContent.text.replace(/```json\n?|\n?```/g, '').trim()

    let result: { tasks?: unknown[] }
    try {
      result = JSON.parse(cleanedText)
    } catch {
      // Attempt to recover from a truncated response by closing the JSON object.
      const fixed = cleanedText
        .replace(/,\s*\{[^}]*$/, '')  // drop last incomplete task object
        .replace(/,\s*$/, '')          // drop trailing comma
        + ']}'                          // close tasks array and root object
      result = JSON.parse(fixed)
    }

    const tasks = Array.isArray(result.tasks) ? result.tasks : []
    return tasks
      .map((t) => ({ title: typeof (t as GeneratedTask)?.title === 'string' ? (t as GeneratedTask).title.trim() : '' }))
      .filter((t) => t.title)
      .slice(0, CEILING)
  } catch (error) {
    // Task generation failing should never block saving the document.
    console.error('generateTasks error:', error)
    return []
  }
}

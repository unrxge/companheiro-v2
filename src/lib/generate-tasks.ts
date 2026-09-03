import { anthropic } from './anthropic'
import { MODELS } from './models'

export interface CoreConcept {
  one_sentence: string
  arc: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
  substack_goals: string
  short_form_goals: string
}

export interface GeneratedTask {
  title: string
  type: 'creation' | 'execution'
  is_writing_related: boolean
}

// Generates the task roadmap for a newly locked piece. Called directly from
// the core-concept save route — this used to be an unauthenticated HTTP
// round-trip to /api/project-board/generate-tasks.
export async function generateTasks(concept: CoreConcept): Promise<GeneratedTask[]> {
  const conceptSummary = `
Idea: ${concept.one_sentence}
Arc: ${concept.arc}
Conviction: ${concept.conviction_statement}
Core Truth: ${concept.core_truth}
Substack Goals: ${concept.substack_goals}
Short-form Goals: ${concept.short_form_goals}
  `

  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 2048,
      system: `You are a creative project manager. Generate a task list for bringing an idea to publication.
The list should flow from initial writing through to posting, balancing creation work (writing, conceptualizing, experimenting) with execution work (editing, formatting, scheduling).
Each task should be concrete and specific.
Each task is labeled as either "creation" (conceptual/creative work) or "execution" (technical/logistical work).

For every task, also set "is_writing_related": true only if the task IS the act of drafting, writing, or revising the piece's actual prose (e.g. "Draft the opening three paragraphs", "Rewrite the ending for a stronger close"). Set it to false for anything else, including creative work that isn't the writing itself — conceptualizing, brainstorming angles, research, designing visuals, planning promotion, formatting, scheduling, etc.

Return as JSON:
{
  "tasks": [
    { "title": "...", "type": "creation" | "execution", "is_writing_related": true | false },
    ...
  ]
}`,
      messages: [
        {
          role: 'user',
          content: `Generate a task sequence for this piece:\n${conceptSummary}`,
        },
      ],
    })

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
    return tasks.map((t) => {
      const task = t as Partial<GeneratedTask>
      return {
        title: task.title || '',
        type: task.type === 'execution' ? 'execution' : 'creation',
        is_writing_related: task.is_writing_related === true,
      }
    })
  } catch (error) {
    // Task generation failing should never block saving the document.
    console.error('generateTasks error:', error)
    return []
  }
}

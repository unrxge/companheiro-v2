import type { Subscription } from './access'

// What each plan allows, in one place. Every route and screen asks this
// instead of looking at the tier itself, so a plan's shape is changed here
// and nowhere else. Pure: safe to import from the browser.
//
//   trial          everything Direction has, for 30 days
//   practice       one project worked on at a time, in words
//   direction      any number of projects, the canvas tools, the vision talk
//   ended          a trial that ran out or a plan that was cancelled: the
//                  work stays (Practice's shape), the companion rests
//   grandfathered  accounts from before billing: everything, for good
//   unknown        no subscription row could be read; never a reason to
//                  take a feature away

export type Plan = 'grandfathered' | 'trial' | 'practice' | 'direction' | 'ended' | 'unknown'

export interface Entitlements {
  plan: Plan
  /** The companion answers (fair use still applies on top). */
  companion: boolean
  /** How many projects can be worked on at once. null is any number. */
  maxActiveProjects: number | null
  /** New threads across the pieces of a project. */
  threads: boolean
  /** New images and recordings on the canvas. */
  media: boolean
  /** "Talk about the vision", the conversation about the whole project. */
  visionTalk: boolean
}

/** How long a project rests after giving up its place to another. */
export const REST_DAYS = 14

const EVERYTHING = { maxActiveProjects: null, threads: true, media: true, visionTalk: true } as const
const ONE_IN_WORDS = { maxActiveProjects: 1, threads: false, media: false, visionTalk: false } as const

export function entitlementsFor(sub: Subscription | null): Entitlements {
  if (!sub) return { plan: 'unknown', companion: false, ...EVERYTHING }
  if (sub.status === 'grandfathered') return { plan: 'grandfathered', companion: true, ...EVERYTHING }
  if (sub.status === 'trialing') {
    const live = !!sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now()
    return live ? { plan: 'trial', companion: true, ...EVERYTHING } : { plan: 'ended', companion: false, ...ONE_IN_WORDS }
  }
  if (sub.status === 'active' || sub.status === 'past_due') {
    return sub.tier === 'direction'
      ? { plan: 'direction', companion: true, ...EVERYTHING }
      : { plan: 'practice', companion: true, ...ONE_IN_WORDS }
  }
  return { plan: 'ended', companion: false, ...ONE_IN_WORDS }
}

/** Said wherever the one-project limit is met; the same words everywhere. */
export function oneAtATimeLine(plan: Plan): string {
  return plan === 'ended' ? 'Without a plan, one project stays open at a time.' : 'Practice carries one project at a time.'
}

export function restEndsAt(from: Date | string | number = Date.now()): string {
  return new Date(new Date(from).getTime() + REST_DAYS * 86_400_000).toISOString()
}

/** Still resting, as of now. */
export function isResting(restingUntil: string | null | undefined): boolean {
  return !!restingUntil && new Date(restingUntil).getTime() > Date.now()
}

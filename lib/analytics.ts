// #107 Admin analytics with PostHog's free plan (separate from Supabase).
// Off unless NEXT_PUBLIC_POSTHOG_KEY is set in Vercel. Only counts screens and actions:
// no typed text, no session recordings, people are an anonymous id (never an email).
let client: any = null
let starting: Promise<any> | null = null
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

function start() {
  if (!key || typeof window === 'undefined') return null
  if (!starting)
    starting = import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        mask_all_text: true,
        persistence: 'localStorage',
        respect_dnt: true,
      })
      client = posthog
      return posthog
    })
  return starting
}

export function track(event: string, props?: Record<string, string | number | boolean | null>) {
  if (!key) return
  if (client) return client.capture(event, props)
  start()
    ?.then((posthog) => posthog.capture(event, props))
    .catch(() => {})
}

/** Ties events to the account's random id so "active people" counts are right. */
export function identify(userId: string, props?: Record<string, string | number | boolean>) {
  if (!key) return
  start()
    ?.then((posthog) => posthog.identify(userId, props))
    .catch(() => {})
}

export function resetAnalytics() {
  client?.reset()
}

export const analyticsOn = !!key

// #75 Offline logging: a Quick log made without signal is kept on the phone and sent later.
// Replays are safe to repeat (the visit keeps the same id), so a half-finished sync can retry.
export type QuickLogJob = {
  id: string // visit id, made on the phone
  userId: string
  placeId: string
  placeName: string
  date: string
  spend: number | null
  extra: Record<string, unknown>
  rating: { score: number; points: number | null; notes: string | null } | null
  v4: boolean
}

const KEY = 'crumbs-offline-queue'
const EVENT = 'crumbs-queue'

export function queued(): QuickLogJob[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list: QuickLogJob[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)))
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

export const enqueue = (job: QuickLogJob) => save([...queued().filter((j) => j.id !== job.id), job])

export function onQueueChange(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

/** True for "no connection" failures (not for errors the database sent back). */
export function isNetworkError(error: any) {
  const text = String(error?.message ?? error ?? '')
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    /Failed to fetch|Load failed|NetworkError|network request failed|ERR_INTERNET/i.test(text)
  )
}

/** Sends one Quick log to the database. Throws on failure. */
export async function runQuickLog(supabase: any, job: QuickLogJob) {
  const { error } = await supabase.from('place_visits').upsert(
    {
      id: job.id,
      place_id: job.placeId,
      visited_on: job.date,
      spend: job.spend,
      created_by: job.userId,
      ...job.extra,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (error) throw error
  const { error: placeError } = await supabase
    .from('places')
    .update({ status: 'Been', visited_on: job.date })
    .eq('id', job.placeId)
  if (placeError) throw placeError
  if (job.rating) {
    const { error: ratingError } = await supabase.from('place_ratings').upsert({
      place_id: job.placeId,
      user_id: job.userId,
      score: job.rating.score,
      notes: job.rating.notes,
      ...(job.v4 ? { points: job.rating.points } : {}),
    })
    if (ratingError) throw ratingError
  }
}

let flushing = false
/** Sends everything waiting for this user. Returns how many were sent. */
export async function flushQueue(supabase: any, userId: string) {
  if (flushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0
  flushing = true
  let sent = 0
  try {
    for (const job of queued().filter((j) => j.userId === userId)) {
      try {
        await runQuickLog(supabase, job)
        save(queued().filter((j) => j.id !== job.id))
        sent++
      } catch (error) {
        if (isNetworkError(error)) break
        // The database refused it (e.g. the place was deleted): drop it rather than retry forever.
        save(queued().filter((j) => j.id !== job.id))
      }
    }
  } finally {
    flushing = false
  }
  return sent
}

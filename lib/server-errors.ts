// Third pass #9: Vercel's free plan keeps server logs for an hour, so route failures also go
// into the app's own error log (Admin → Errors, marked "server"). Needs the server key; without
// it this only writes to the server log. Never throws.
import { createClient } from '@supabase/supabase-js'

export async function logServerError(where: string, error: unknown, userId?: string | null) {
  const err = error as any
  const message = `[${where}] ${String(err?.message ?? err ?? 'error')}`.slice(0, 500)
  console.error(message)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) return
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const row = {
      message,
      stack: typeof err?.stack === 'string' ? err.stack.slice(0, 2000) : null,
      url: where.slice(0, 300),
      user_id: userId ?? null,
    }
    const { error: failed } = await db.from('client_errors').insert({ ...row, source: 'server' })
    // Before the Round 77 SQL there's no "source" column.
    if (failed && /source/.test(failed.message)) await db.from('client_errors').insert(row)
  } catch {}
}

/** Wraps a route handler: an unexpected error is kept, and the phone gets a plain 500. */
export function keepErrors<A extends unknown[]>(
  where: string,
  handler: (...args: A) => Promise<Response>,
) {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      await logServerError(where, error)
      return Response.json({ error: 'Something went wrong on our side' }, { status: 500 })
    }
  }
}

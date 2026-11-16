// E14 (Round 77): public restaurant pages are kept for an hour and profiles for ten minutes. When
// an owner edits their page, or someone saves their public profile, the app asks for the kept
// copies to be rebuilt on the next visit, so the change shows straight away.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isLetIn, NOT_LET_IN } from '@/lib/let-in'
import { tooManyRequests } from '@/lib/rate-limit'
import { keepErrors } from '@/lib/server-errors'

async function handlePOST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (!(await isLetIn(supabase, data.user.id))) return Response.json(NOT_LET_IN, { status: 403 })
  if (tooManyRequests(`revalidate:${data.user.id}`, 30)) return Response.json({ ok: false }, { status: 429 })
  const body = await request.json().catch(() => ({}))
  if (body.kind === 'restaurant') revalidatePath('/r/[city]/[slug]', 'page')
  else if (body.kind === 'profile') revalidatePath('/u/[handle]', 'page')
  else return Response.json({ error: 'Bad request' }, { status: 400 })
  return Response.json({ ok: true })
}

export const POST = keepErrors('POST /api/revalidate', handlePOST)

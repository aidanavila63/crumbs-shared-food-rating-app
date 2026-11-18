// E14 (Round 77): public restaurant pages are kept for an hour and profiles for ten minutes. When
// an owner edits their page, or someone saves their public profile, the app asks for the kept
// copies to be rebuilt on the next visit, so the change shows straight away.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { gate } from '@/lib/server-gate'
import { tooManyRequests } from '@/lib/rate-limit'
import { keepErrors } from '@/lib/server-errors'

async function handlePOST(request: Request) {
  const supabase = await createClient()
  // E17 (Round 86): signed in + let in (+ switch) in one go
  const pass = await gate(supabase)
  if ('response' in pass) return pass.response
  const data = { user: { id: pass.userId } }
  if (tooManyRequests(`revalidate:${data.user.id}`, 30)) return Response.json({ ok: false }, { status: 429 })
  const body = await request.json().catch(() => ({}))
  if (body.kind === 'restaurant') revalidatePath('/r/[city]/[slug]', 'page')
  else if (body.kind === 'profile') revalidatePath('/u/[handle]', 'page')
  else return Response.json({ error: 'Bad request' }, { status: 400 })
  return Response.json({ ok: true })
}

export const POST = keepErrors('POST /api/revalidate', handlePOST)

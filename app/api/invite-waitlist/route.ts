// Third pass #18 (Round 78): Admin → Waitlist → Invite. The email is let in on arrival (no "ask
// to join"), and the one invitation email goes out when email sending is set up; otherwise the
// text comes back for Aidan to send himself.
import { createClient } from '@/lib/supabase/server'
import { sendEmail, waitlistInvitation } from '@/lib/email'
import { siteUrl } from '@/lib/site'
import { keepErrors } from '@/lib/server-errors'

async function handlePOST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (typeof body.entry !== 'string') return Response.json({ error: 'Bad request' }, { status: 400 })
  const { data: invited, error } = await supabase.rpc('invite_from_waitlist', { entry: body.entry })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  const mail = waitlistInvitation(`${siteUrl()}/?signin=1`)
  const result = await sendEmail({ to: (invited as any).email, ...mail })
  return Response.json({ ...(invited as object), ...result })
}

export const POST = keepErrors('POST /api/invite-waitlist', handlePOST)

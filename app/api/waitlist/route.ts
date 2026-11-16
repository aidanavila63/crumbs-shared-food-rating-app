// S8 (Round 77): the waitlist with a bot check. When Turnstile is set up in Vercel
// (NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY), the form sends sign-ups here; this checks
// Cloudflare's answer and saves the email with the server key. Admin → Notice and pause → "Bot
// check on the waitlist" then closes the direct way in.
import { createClient } from '@supabase/supabase-js'
import { keepErrors } from '@/lib/server-errors'
import { verifyTurnstile } from '@/lib/turnstile'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

async function handlePOST(request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!secret || !key || !url) return Response.json({ error: 'Not set up' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200)
  const note = String(body.note ?? '').trim().slice(0, 300) || null
  if (!EMAIL.test(email)) return Response.json({ error: 'That email doesn’t look right.' }, { status: 400 })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  if (typeof body.token !== 'string' || !(await verifyTurnstile(body.token, secret, ip)))
    return Response.json({ error: 'The robot check didn’t go through. Try again.' }, { status: 400 })
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await db.from('waitlist').insert({ email, note })
  // Already on the list counts as success (don't reveal who signed up).
  if (error && error.code !== '23505') throw new Error(error.message)
  return Response.json({ ok: true })
}

export const POST = keepErrors('POST /api/waitlist', handlePOST)

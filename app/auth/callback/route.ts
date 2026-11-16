import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logServerError } from '@/lib/server-errors'

// Only paths inside Crumbs (e.g. /invite/ABC234), never another site.
function safeNext(next: string | null) {
  return next && /^\/[A-Za-z0-9/_-]*$/.test(next) && !next.startsWith('//') ? next : '/'
}

// Third pass #4: a sign-in link that expired (or was already used) used to land on the landing
// page with no word about it. Now it opens the sign-in box with "That link expired".
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const failed = () =>
    NextResponse.redirect(new URL('/?signin=1&link=expired', url.origin))
  if (url.searchParams.get('error') || url.searchParams.get('error_code')) return failed()
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code)
    if (error) {
      // Expired or used links are normal; anything else is worth keeping.
      if (!/expired|invalid|already|verifier/i.test(error.message))
        await logServerError('GET /auth/callback', error)
      return failed()
    }
  }
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url.origin))
}

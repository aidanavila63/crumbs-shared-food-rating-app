import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Only paths inside Crumbs (e.g. /invite/ABC234), never another site.
function safeNext(next: string | null) {
  return next && /^\/[A-Za-z0-9/_-]*$/.test(next) && !next.startsWith('//') ? next : '/'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) await (await createClient()).auth.exchangeCodeForSession(code)
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url.origin))
}

import { updateSession } from '@/lib/supabase/proxy'
import { NextResponse, type NextRequest } from 'next/server'
import { cleanCode, invitePath, isJoinCode } from '@/lib/invite'

export async function proxy(request: NextRequest) {
  // Old invite links (…/?join=CODE) open the invite page like new ones.
  const join = cleanCode(request.nextUrl.searchParams.get('join'))
  if (request.nextUrl.pathname === '/' && isJoinCode(join))
    return NextResponse.redirect(new URL(invitePath(join), request.url))
  return updateSession(request)
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

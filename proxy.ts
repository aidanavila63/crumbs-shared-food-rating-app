import { updateSession } from '@/lib/supabase/proxy'
import { NextResponse, type NextRequest } from 'next/server'
import { cleanCode, invitePath, isJoinCode } from '@/lib/invite'
import { hasSession, movedTo } from '@/lib/session-cookie'

export async function proxy(request: NextRequest) {
  // Third pass #15 (Round 78): after the move to Crumbs' own address (NEXT_PUBLIC_SITE_URL), the
  // old …vercel.app address sends people there, same page. Only on the live site (previews keep
  // their own addresses), and never for the scheduled jobs.
  const moved = movedTo(request.nextUrl, process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_ENV)
  if (moved) return NextResponse.redirect(moved, 308)

  // Old invite links (…/?join=CODE) open the invite page like new ones.
  const join = cleanCode(request.nextUrl.searchParams.get('join'))
  if (request.nextUrl.pathname === '/' && isJoinCode(join))
    return NextResponse.redirect(new URL(invitePath(join), request.url))
  // E15 (Round 77): a visitor who isn't signed in gets the landing page straight away (built ahead,
  // small), not the whole app saying "Loading Crumbs…" first. Only the bare address: /?signin=1,
  // /?place=… and the like still open the app.
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE !== 'true' &&
    request.nextUrl.pathname === '/' &&
    !request.nextUrl.search &&
    !hasSession(request.cookies.getAll().map((c) => c.name))
  ) {
    const landing = NextResponse.rewrite(new URL('/welcome', request.url))
    landing.headers.set('x-crumbs-page', 'landing')
    // The same address shows the app once signed in: browsers must not keep the landing page for it.
    landing.headers.set('cache-control', 'private, no-cache, no-store, max-age=0, must-revalidate')
    return landing
  }
  return updateSession(request)
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

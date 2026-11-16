// Round 77 (third pass #5): which build is live. An open app compares it with its own and offers
// "Update ready — tap to refresh". Never cached.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'local', at: process.env.NEXT_PUBLIC_BUILD_TIME ?? null },
    { headers: { 'cache-control': 'no-store' } },
  )
}

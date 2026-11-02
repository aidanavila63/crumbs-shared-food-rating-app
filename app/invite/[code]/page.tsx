import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/server'
import { cleanCode, isJoinCode } from '@/lib/invite'
import { InviteLanding, type InvitePreview } from '@/components/invite-landing'

// The page an invite link opens: what the group is, then sign in and join (or ask to join).
export const dynamic = 'force-dynamic'

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const DEMO_PREVIEW: InvitePreview = {
  name: 'Maya & Jordan',
  emoji: '🍜',
  color: null,
  description: 'Ramen hunting, one bowl at a time.',
  guest: false,
  approval: true,
  owner: 'Maya',
  members: 2,
  places: 14,
  member: false,
  requested: false,
  id: null,
}

async function load(code: string): Promise<{ preview: InvitePreview | null; signedIn: boolean }> {
  if (demo) return { preview: isJoinCode(code) ? DEMO_PREVIEW : null, signedIn: false }
  if (!isJoinCode(code)) return { preview: null, signedIn: false }
  const supabase = await createClient()
  const [{ data: preview }, { data: auth }] = await Promise.all([
    supabase.rpc('invite_preview', { code }),
    supabase.auth.getUser(),
  ])
  return { preview: (preview as InvitePreview | null) ?? null, signedIn: !!auth.user }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const code = cleanCode((await params).code)
  const { preview } = await load(code)
  const title = preview ? `Join ${preview.name} on Crumbs` : 'Crumbs invite'
  return {
    title,
    description: 'Your group’s shared food map — rate places together and decide where to eat.',
    openGraph: { title, description: 'You’re invited to a shared food map on Crumbs.' },
    robots: { index: false, follow: false },
  }
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code)
  const { preview, signedIn } = await load(code)
  return (
    <>
      <InviteLanding code={code} initial={preview} signedIn={signedIn} demo={demo} />
      <Toaster position="top-center" richColors />
    </>
  )
}

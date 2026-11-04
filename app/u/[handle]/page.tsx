import type { Metadata } from 'next'
import { loadProfile } from '@/lib/public-data'
import { PublicProfileView } from '@/components/public-profile-view'

// Only people who switched their profile on have one. Not listed in search engines.
export const revalidate = 600

type Params = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const profile = await loadProfile((await params).handle)
  if (!profile) return { title: 'Crumbs', robots: { index: false, follow: false } }
  const description = profile.bio || `${profile.name}'s favourite places on Crumbs`
  return {
    title: `${profile.name} (@${profile.handle}) · Crumbs`,
    description,
    openGraph: { title: `${profile.name} on Crumbs`, description },
    robots: { index: false, follow: false },
  }
}

export default async function ProfileRoute({ params }: Params) {
  const profile = await loadProfile((await params).handle)
  return <PublicProfileView profile={profile} />
}

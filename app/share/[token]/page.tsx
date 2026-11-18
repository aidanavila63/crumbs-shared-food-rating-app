import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { SaveListButton } from '@/components/save-list-button'

export const metadata: Metadata = {
  title: 'Shared list · Crumbs',
  robots: { index: false, follow: false },
}
// E29 (Round 77): same for everyone who opens the link, so it's kept for a minute instead of
// being rebuilt (with a sign-in check) on every view. Unsharing takes effect within the minute.
export const revalidate = 60
export function generateStaticParams() {
  return []
}

function anon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

type SharedPlace = {
  name: string
  address: string | null
  cuisine: string | null
  price_level: number | null
  status: string
  avg: number | null
  /** U11 (Round 95) */
  lat?: number | null
  lng?: number | null
  website?: string | null
  maps_url?: string | null
  city?: string | null
  slug?: string | null
}

/** A map link for one place: its Google Maps link, or a search for it. */
function directions(place: SharedPlace) {
  if (place.maps_url) return place.maps_url
  const q = place.lat != null && place.lng != null ? `${place.lat},${place.lng}` : `${place.name} ${place.address ?? ''}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.trim())}`
}

export default async function SharedListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data } =
    /^[a-f0-9]{16,128}$/.test(token) && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true'
      ? await anon().rpc('get_shared_list', { share_token: token })
    : { data: null }
  const list = data as { name: string; emoji: string; places: SharedPlace[] } | null

  if (!list)
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="mt-16 font-serif text-3xl font-bold">This link isn&apos;t active</h1>
        <p className="mt-3 text-muted-foreground">The list may have been unshared or deleted.</p>
      </main>
    )

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-5 pb-16">
      <p className="text-sm text-muted-foreground">Shared from Crumbs</p>
      <h1 className="font-serif text-4xl font-bold">
        {list.emoji} {list.name}
      </h1>
      {/* U11 (Round 95): copy it into your own Crumbs (signs you in first if needed) */}
      {list.places.length > 0 && (
        <SaveListButton token={token} />
      )}
      {list.places.length === 0 && (
        <p className="text-muted-foreground">Nothing on this list yet.</p>
      )}
      {list.places.map((place) => (
        <div
          className="surface flex items-start justify-between gap-3"
          key={`${place.name}${place.address}`}
        >
          <div>
            <h2 className="font-serif text-xl font-bold">{place.name}</h2>
            {place.address && <p className="text-sm text-muted-foreground">{place.address}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                place.cuisine,
                place.price_level ? '$'.repeat(place.price_level) : null,
                place.status,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
              <a className="text-primary underline" href={directions(place)} target="_blank" rel="noopener noreferrer">
                Directions
              </a>
              {place.website && (
                <a className="text-primary underline" href={place.website} target="_blank" rel="noopener noreferrer nofollow">
                  Website
                </a>
              )}
              {place.city && place.slug && (
                <a className="text-primary underline" href={`/r/${place.city}/${place.slug}`}>
                  On Crumbs
                </a>
              )}
            </p>
          </div>
          {place.avg !== null && (
            <strong className="font-serif text-2xl text-primary">
              {Number(place.avg).toFixed(1)}
            </strong>
          )}
        </div>
      ))}
    </main>
  )
}

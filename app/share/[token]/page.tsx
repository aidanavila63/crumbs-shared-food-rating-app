import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Shared list · Crumbs',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

type SharedPlace = {
  name: string
  address: string | null
  cuisine: string | null
  price_level: number | null
  status: string
  avg: number | null
}

export default async function SharedListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = /^[a-f0-9]{16,128}$/.test(token)
    ? await supabase.rpc('get_shared_list', { share_token: token })
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

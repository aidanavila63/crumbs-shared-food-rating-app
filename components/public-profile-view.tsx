'use client'
// /u/<handle>: what someone chose to show — name, photo, bio, favourite places and dishes, badges,
// passport, food map. No email, no groups, no ratings of anyone else.
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo } from 'react'
import { Wordmark } from './wordmark'
import { cityLabel, restaurantPath, type PublicProfile } from '@/lib/public-page'
import type { Place } from '@/hooks/use-crumbs-data'

const OsmMap = dynamic(() => import('./osm-map').then((m) => m.OsmMap), { ssr: false })

export function PublicProfileView({ profile }: { profile: PublicProfile | null }) {
  const mapPlaces = useMemo(
    () =>
      (profile?.places ?? [])
        .filter((p) => p.lat !== null && p.lng !== null)
        .map(
          (p) =>
            ({
              id: restaurantPath(p.city, p.slug),
              group_id: '',
              name: p.name,
              latitude: p.lat,
              longitude: p.lng,
              status: 'Been',
              tags: [],
              dishes: [],
              place_ratings: [],
              pinned: false,
            }) as unknown as Place,
        ),
    [profile],
  )
  if (!profile)
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="mt-16 font-serif text-3xl font-bold">This profile is private</h1>
        <p className="mt-3 text-muted-foreground">
          Either it doesn&apos;t exist or the person keeps it to themselves.
        </p>
        <Link className="primary mt-6" href="/">Open Crumbs</Link>
      </main>
    )
  const show = profile.show ?? {}
  const stats = profile.stats ?? {}
  const statItems = [
    ['places', 'Places'],
    ['cuisines', 'Cuisines'],
    ['cities', 'Cities'],
    ['visits', 'Visits'],
  ] as const
  const center = mapPlaces.length
    ? { lat: mapPlaces[0].latitude!, lng: mapPlaces[0].longitude! }
    : { lat: 43.65, lng: -79.38 }
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-16">
      <Link href="/" aria-label="Crumbs home" className="self-start">
        <Wordmark height={26} />
      </Link>
      <header className="flex flex-col items-center gap-2 pt-2 text-center">
        <div className="grid size-24 place-items-center overflow-hidden rounded-full bg-muted text-4xl font-bold text-primary">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            (profile.name?.[0] ?? '?').toUpperCase()
          )}
        </div>
        <h1 className="font-serif text-3xl font-bold">{profile.name}</h1>
        <p className="text-sm text-muted-foreground">@{profile.handle}</p>
        {profile.bio && <p className="max-w-xs text-[15px]">{profile.bio}</p>}
      </header>

      {statItems.some(([k]) => stats[k]) && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {statItems.map(([k, label]) => (
            <div key={k} className="surface-soft">
              <b className="block font-serif text-xl text-primary">{stats[k] ?? 0}</b>
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      {profile.badges.length > 0 && (
        <section className="surface">
          <h2 className="mb-3 font-serif text-lg font-bold">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {profile.badges.map((b) => (
              <span key={b.key} className="tag">{b.emoji} {b.label}</span>
            ))}
          </div>
        </section>
      )}

      {show.favourites && profile.places.length > 0 && (
        <section className="surface">
          <h2 className="mb-3 font-serif text-lg font-bold">Favourite places</h2>
          <ul className="flex flex-col gap-3">
            {profile.places.map((p) => (
              <li key={`${p.city}/${p.slug}`}>
                <Link className="flex items-baseline justify-between gap-3" href={restaurantPath(p.city, p.slug)}>
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[p.cuisine, cityLabel(p.city)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {p.score !== null && <b className="font-serif text-xl text-primary">{Number(p.score).toFixed(1)}</b>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {show.dishes && profile.dishes.length > 0 && (
        <section className="surface">
          <h2 className="mb-3 font-serif text-lg font-bold">Top dishes</h2>
          <ul className="flex flex-col gap-2">
            {profile.dishes.map((d, i) => (
              <li key={i}>
                <Link href={restaurantPath(d.city, d.slug)}>
                  <span className="font-semibold">{d.dish}</span>
                  <span className="text-sm text-muted-foreground"> · {d.restaurant}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {show.passport && profile.passport.length > 0 && (
        <section className="surface">
          <h2 className="mb-3 font-serif text-lg font-bold">Passport</h2>
          <div className="flex flex-wrap gap-2">
            {profile.passport.map((s) => (
              <span key={s.city} className="tag">🛂 {s.city} · {s.count}</span>
            ))}
          </div>
        </section>
      )}

      {show.map && mapPlaces.length > 0 && (
        <section className="surface overflow-hidden">
          <h2 className="mb-3 font-serif text-lg font-bold">Food map</h2>
          <div className="h-64 overflow-hidden rounded-2xl">
            <OsmMap
              places={mapPlaces}
              center={center}
              locateTarget={null}
              onPick={(id) => (window.location.href = id)}
              onBackgroundClick={() => {}}
            />
          </div>
        </section>
      )}

      <footer className="mt-2 rounded-3xl bg-muted p-4 text-center text-sm">
        <p className="font-semibold">Keep your own food map on Crumbs.</p>
        <Link className="primary mt-3 w-full" href="/">Open Crumbs</Link>
      </footer>
    </main>
  )
}

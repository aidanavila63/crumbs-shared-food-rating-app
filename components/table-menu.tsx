'use client'
// O1 (Round 89): what a diner sees after scanning the QR on the table — the menu, big and plain,
// with the restaurant's own posts (today's specials) on top. Counted as a "table QR scan" for the
// owner (totals only).
import { useEffect } from 'react'
import Link from 'next/link'
import { MenuTab } from './restaurant-page'
import { Wordmark } from './wordmark'
import { countTap } from '@/lib/taps'
import { restaurantPath, type PublicRestaurant } from '@/lib/public-page'

export function TableMenu({ data }: { data: PublicRestaurant }) {
  useEffect(() => countTap(data.id, 'table_menu', data.claimed), [data.id, data.claimed])
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-16">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Menu</p>
        <h1 className="font-serif text-3xl font-bold leading-tight">{data.name}</h1>
        {data.name_local && data.name_local !== data.name && (
          <p className="font-serif text-xl">{data.name_local}</p>
        )}
      </header>
      {data.posts.length > 0 && (
        <section className="surface flex flex-col gap-2">
          <h2 className="font-serif text-lg font-bold">From the restaurant</h2>
          <ul className="flex flex-col gap-2">
            {data.posts.map((p, i) => (
              <li key={i}>
                <strong>{p.title}</strong>
                {p.body && <p className="text-sm text-muted-foreground">{p.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <MenuTab data={data} />
      <p className="text-xs text-muted-foreground">
        Prices and dishes can change — ask your server. Tell them about any allergies before you order.
      </p>
      <footer className="mt-2 flex flex-col items-center gap-2 rounded-3xl bg-muted p-4 text-center text-sm">
        <Wordmark height={22} />
        <p className="text-muted-foreground">Save {data.name}, rate your dishes and see what your friends loved.</p>
        {data.city && data.slug && (
          <Link className="primary w-full" href={restaurantPath(data.city, data.slug)}>
            See {data.name} on Crumbs
          </Link>
        )}
      </footer>
    </main>
  )
}

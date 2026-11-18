'use client'
// O1 (Round 89): what a diner sees after scanning the QR on the table — the menu, big and plain,
// with the restaurant's own posts (today's specials) on top. Counted as a "table QR scan" for the
// owner (totals only).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MenuTab } from './restaurant-page'
import { Wordmark } from './wordmark'
import { countTap } from '@/lib/taps'
import { restaurantPath, type PublicRestaurant } from '@/lib/public-page'
import { menuTheme, themeStyle } from '@/lib/menu-themes'
import { photoUrl } from '@/lib/photos'

export function TableMenu({ data }: { data: PublicRestaurant }) {
  useEffect(() => countTap(data.id, 'table_menu', data.claimed), [data.id, data.claimed])
  // O15 (Round 95): the owner's chosen look and logo
  // (?look=<theme> previews a look before the cache catches up — the owner's "See what diners see")
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    Promise.resolve().then(() => setPreview(new URLSearchParams(window.location.search).get('look')))
  }, [])
  const theme = menuTheme(preview ?? data.menu_theme)
  const logo = photoUrl(data.logo_path)
  return (
    <div className="table-menu min-h-dvh" style={themeStyle(theme) as React.CSSProperties}>
      <div aria-hidden="true" className="h-4 w-full" style={{ background: theme.band }} />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-16">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={`${data.name} logo`}
            className="mx-auto mt-2 size-24 rounded-2xl object-contain"
          />
        )}
        <header className={`flex flex-col gap-1 ${logo ? 'items-center text-center' : ''}`}>
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
          Prices and dishes can change — ask your server. Tell them about any allergies before you
          order.
        </p>
        <footer className="mt-2 flex flex-col items-center gap-2 rounded-3xl bg-muted p-4 text-center text-sm">
          <Wordmark height={22} />
          <p className="text-muted-foreground">
            Save {data.name}, rate your dishes and see what your friends loved.
          </p>
          {data.city && data.slug && (
            <Link className="primary w-full" href={restaurantPath(data.city, data.slug)}>
              See {data.name} on Crumbs
            </Link>
          )}
        </footer>
      </main>
    </div>
  )
}

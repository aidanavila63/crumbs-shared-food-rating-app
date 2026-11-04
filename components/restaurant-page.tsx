'use client'
// The restaurant's page: what Crumbs (everyone together) knows about it, shown the same way to a
// stranger on /r/<city>/<name> and to a member inside the app. Instagram-clean on top (name,
// score, two buttons, five tiles), Google-style depth underneath (tabs). Totals only — nothing
// here says who rated, which group, or what anyone wrote privately.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BadgeCheck, Globe, MapPin, MoreHorizontal, Phone, Share2, Star } from 'lucide-react'
import { StatusFilter } from './status-filter'
import { Sheet } from './sheet'
import { openStatus } from '@/lib/place-info'
import { photoUrl } from '@/lib/photos'
import {
  busyLine,
  directionsUrl,
  factChips,
  histRows,
  hoursLines,
  isClosedForGood,
  menuSections,
  metaLine,
  phoneHref,
  priceText,
  restaurantPath,
  safeUrl,
  scoreLine,
  siteLabel,
  spendLine,
  waitLine,
  type PublicRestaurant,
} from '@/lib/public-page'

const TABS = ['Overview', 'Menu', 'Photos', 'Info'] as const
const COURSE: Record<string, string> = {
  starter: 'Starters',
  main: 'Mains',
  side: 'Sides',
  dessert: 'Desserts',
  drink: 'Drinks',
  other: 'More',
}

export function RestaurantPage({
  data,
  ourGroup,
  onSave,
  onLog,
  onReport,
  saved,
}: {
  data: PublicRestaurant
  /** the group's own page (rating, visits, dishes, notes), shown on the "Our group" tab */
  ourGroup?: React.ReactNode
  /** "Save to try" and "Log a visit". On the public page these bring you into Crumbs. */
  onSave?: () => void
  onLog?: () => void
  /** "Report a problem" from the More sheet (signed-in people only) */
  onReport?: (text: string) => Promise<void> | void
  /** already on this group's list */
  saved?: boolean
}) {
  const tabs = useMemo<string[]>(() => (ourGroup ? [...TABS, 'Our group'] : [...TABS]), [ourGroup])
  const [tab, setTab] = useState<string>('Overview')
  const [more, setMore] = useState(false)
  const hero = data.tips.find((t) => t.kind === 'storefront' && t.photo_path)?.photo_path
  const heroUrl = photoUrl(hero)
  const status = useMemo(() => openStatus(data.hours), [data.hours])
  const tel = phoneHref(data.phone)
  const site = safeUrl(data.website)
  const link = () =>
    data.city && data.slug && typeof location !== 'undefined'
      ? `${location.origin}${restaurantPath(data.city, data.slug)}`
      : ''
  async function share() {
    const url = link()
    try {
      if (navigator.share) await navigator.share({ title: data.name, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      }
    } catch {}
  }
  const tile = (icon: React.ReactNode, label: string, props: { href?: string; onClick?: () => void }) => {
    const inner = (
      <>
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-muted text-primary">
          {icon}
        </span>
        <span className="mt-1 text-[11.5px] font-semibold">{label}</span>
      </>
    )
    const cls = 'flex flex-col items-center text-center'
    return props.href ? (
      <a key={label} className={cls} href={props.href} target={props.href.startsWith('tel:') ? undefined : '_blank'} rel="noopener noreferrer">
        {inner}
      </a>
    ) : (
      <button key={label} type="button" className={cls} onClick={props.onClick}>
        {inner}
      </button>
    )
  }
  const closed = isClosedForGood(data)
  const score = scoreLine(data)

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative -mx-1 h-36 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/25 via-muted to-card"
        style={heroUrl ? { backgroundImage: `url(${heroUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        aria-hidden="true"
      >
        {!heroUrl && <span className="absolute inset-0 grid place-items-center text-6xl opacity-70">🍽️</span>}
      </div>

      <header>
        <h1 className="flex items-center gap-2 font-serif text-3xl font-bold leading-tight">
          {data.name}
          {data.claimed && (
            <span title="Verified by the owner" className="text-primary">
              <BadgeCheck className="size-6" aria-label="Verified by the owner" />
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{metaLine(data) || 'On Crumbs'}</p>
        {closed && <p className="mt-2 text-sm font-semibold text-destructive">Permanently closed</p>}
        {!closed && status && (
          <p className={`mt-1 text-sm font-semibold ${status.open ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            {status.text}
          </p>
        )}
        {score && (
          <p className="mt-3 flex items-center gap-2">
            <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="font-serif text-2xl font-bold">{Number(data.rating!.avg).toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">
              from {data.rating!.groups} group{data.rating!.groups === 1 ? '' : 's'}
              {data.rating!.would_return !== null && ` · ${data.rating!.would_return}% would go back`}
            </span>
          </p>
        )}
        {!score && (
          <p className="mt-3 text-sm text-muted-foreground">
            Not enough groups have rated it yet — scores show once 3 groups agree.
          </p>
        )}
      </header>

      <div className="flex gap-2">
        <button type="button" className="primary flex-1" onClick={onSave} disabled={saved}>
          {saved ? 'On your list' : 'Save to try'}
        </button>
        <button
          type="button"
          className="secondary flex-1"
          onClick={ourGroup ? () => setTab('Our group') : onLog}
        >
          Log a visit
        </button>
      </div>

      <nav className="grid grid-cols-5 gap-1.5" aria-label="Quick actions">
        {tile(<Phone className="size-5" />, 'Call', tel ? { href: tel } : { onClick: () => toast('No phone number yet') })}
        {tile(<Globe className="size-5" />, 'Website', site ? { href: site } : { onClick: () => toast('No website yet') })}
        {tile(<MapPin className="size-5" />, 'Directions', { href: directionsUrl(data) })}
        {tile(<Share2 className="size-5" />, 'Share', { onClick: share })}
        {tile(<MoreHorizontal className="size-5" />, 'More', { onClick: () => setMore(true) })}
      </nav>

      <StatusFilter items={tabs} value={tab} counts={null} onChange={setTab} label="Page sections" />

      {tab === 'Overview' && <Overview data={data} />}
      {tab === 'Menu' && <MenuTab data={data} />}
      {tab === 'Photos' && <PhotosTab data={data} />}
      {tab === 'Info' && <InfoTab data={data} onReport={onReport} />}
      {tab === 'Our group' && ourGroup}

      {more && (
        <MoreSheet
          data={data}
          site={site}
          onShare={share}
          onClose={() => setMore(false)}
          onReport={onReport}
        />
      )}
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="surface">
      {title && <h2 className="mb-3 font-serif text-lg font-bold">{title}</h2>}
      {children}
    </section>
  )
}

function Overview({ data }: { data: PublicRestaurant }) {
  const chips = factChips(data.good_to_know)
  const busy = busyLine(data)
  const wait = waitLine(data)
  const spend = spendLine(data.spend)
  const photos = data.tips.filter((t) => t.photo_path)
  const nothing =
    !data.rating && !data.top_dishes.length && !chips.length && !busy && !spend && !data.posts.length
  return (
    <div className="flex flex-col gap-4">
      {data.posts.length > 0 && (
        <Card title="From the restaurant">
          <ul className="flex flex-col gap-2">
            {data.posts.map((p, i) => (
              <li key={i}>
                <strong>{p.title}</strong>
                {p.body && <p className="text-sm text-muted-foreground">{p.body}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data.known_for.length > 0 && (
        <Card title="Known for">
          <div className="flex flex-wrap gap-2">
            {data.known_for.map((k) => (
              <span key={k.reason} className="tag">
                {k.reason}
              </span>
            ))}
          </div>
        </Card>
      )}
      {data.top_dishes.length > 0 && (
        <Card title="Most-loved dishes">
          <ol className="flex flex-col gap-2">
            {data.top_dishes.map((d) => (
              <li key={d.name} className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{d.name}</span>
                <span className="text-sm text-muted-foreground">
                  {(d.points / 20).toFixed(1)} · {d.groups} groups
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {data.rating && (
        <Card title="How groups rated it">
          <div className="flex flex-col gap-1.5">
            {histRows(data.rating.hist).map((row) => (
              <div key={row.stars} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-muted-foreground">{row.stars}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${row.pct}%` }} />
                </span>
                <span className="w-8 text-right text-muted-foreground">{row.count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {(busy || spend || wait) && (
        <Card title="What to expect">
          <ul className="flex flex-col gap-1.5 text-sm">
            {busy && <li>🕒 {busy}</li>}
            {wait && <li>⏳ {wait}</li>}
            {spend && <li>💵 {spend}</li>}
            {data.visits ? <li>📍 {data.visits} visits logged</li> : null}
          </ul>
        </Card>
      )}
      {chips.length > 0 && (
        <Card title="Good to know">
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c.label} className={`tag ${c.warn ? 'text-destructive' : ''}`}>
                {c.emoji} {c.label}
                {c.owner && <BadgeCheck className="ml-1 inline size-3.5 text-primary" aria-label="Confirmed by the owner" />}
              </span>
            ))}
          </div>
        </Card>
      )}
      {photos.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {photos.slice(0, 6).map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={photoUrl(p.photo_path)!} alt={p.body ?? 'Photo'} className="h-28 w-36 shrink-0 rounded-2xl object-cover" loading="lazy" />
          ))}
        </div>
      )}
      {nothing && (
        <div className="empty">
          <p className="font-semibold">Just getting started</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Scores, dishes and tips appear here once a few groups have been.
          </p>
        </div>
      )}
    </div>
  )
}

function MenuTab({ data }: { data: PublicRestaurant }) {
  const sections = menuSections(data.menu)
  if (!sections.length)
    return (
      <div className="empty">
        <p className="font-semibold">No menu yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Menus come from people who&apos;ve been (and the owner, once they claim the page).</p>
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      {sections.map((s) => (
        <Card key={s.course} title={COURSE[s.course]}>
          <ul className="flex flex-col gap-3">
            {s.items.map((m) => (
              <li key={m.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{m.name}</span>
                  {m.price !== null && <span className="text-sm text-muted-foreground">${Number(m.price).toFixed(2)}</span>}
                </div>
                {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function PhotosTab({ data }: { data: PublicRestaurant }) {
  const photos = data.tips.filter((t) => t.photo_path)
  if (!photos.length)
    return (
      <div className="empty">
        <p className="font-semibold">No photos yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Shop-front and entrance photos from visitors show up here.</p>
      </div>
    )
  return (
    <div className="grid grid-cols-2 gap-2">
      {photos.map((p, i) => (
        <figure key={i} className="overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(p.photo_path)!} alt={p.body ?? 'Photo'} className="aspect-square w-full object-cover" loading="lazy" />
          {p.body && <figcaption className="px-1 py-1 text-xs text-muted-foreground">{p.body}</figcaption>}
        </figure>
      ))}
    </div>
  )
}

function InfoTab({ data, onReport }: { data: PublicRestaurant; onReport?: (text: string) => Promise<void> | void }) {
  const lines = hoursLines(data.hours)
  const tel = phoneHref(data.phone)
  const site = safeUrl(data.website)
  const notes = data.tips.filter((t) => t.body)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Find it">
        <p className="text-sm">{data.address ?? 'Address not confirmed yet'}</p>
        <a className="secondary mt-3 w-full" href={directionsUrl(data)} target="_blank" rel="noopener noreferrer">
          <MapPin className="size-4" /> Directions
        </a>
      </Card>
      {notes.length > 0 && (
        <Card title="Getting in">
          <ul className="flex flex-col gap-2 text-sm">
            {notes.map((t, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{t.kind === 'parking' ? '🅿️' : '🚪'}</span> {t.body}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Hours">
        {lines.length ? (
          <ul className="text-sm">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Hours haven&apos;t been added yet.</p>
        )}
      </Card>
      <Card title="Contact">
        <ul className="flex flex-col gap-1.5 text-sm">
          {tel ? <li><a className="text-primary underline" href={tel}>{data.phone}</a></li> : <li className="text-muted-foreground">No phone yet</li>}
          {site ? <li><a className="text-primary underline" href={site} target="_blank" rel="noopener noreferrer">{siteLabel(site)}</a></li> : <li className="text-muted-foreground">No website yet</li>}
        </ul>
      </Card>
      {!data.claimed && (
        <Card>
          <p className="text-sm">
            <strong>Do you own {data.name}?</strong> Claim this page to add your hours, menu and news — it&apos;s free.
          </p>
          <Link className="secondary mt-3 w-full" href="/">Claim this page</Link>
        </Card>
      )}
      {onReport && <ReportBox onReport={onReport} />}
    </div>
  )
}

function ReportBox({ onReport }: { onReport: (text: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open)
    return (
      <button type="button" className="text-center text-sm text-muted-foreground underline" onClick={() => setOpen(true)}>
        Report a problem with this page
      </button>
    )
  return (
    <Card title="Report a problem">
      <textarea className="field min-h-24" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="What's wrong? (closed down, wrong number, not a restaurant…)" />
      <button
        type="button"
        className="primary mt-3 w-full"
        disabled={busy || text.trim().length < 3}
        onClick={async () => {
          setBusy(true)
          try {
            await onReport(text.trim())
            toast.success('Thanks — we’ll take a look')
            setOpen(false)
            setText('')
          } catch (error: any) {
            toast.error(error?.message || 'Could not send that')
          } finally {
            setBusy(false)
          }
        }}
      >
        Send report
      </button>
    </Card>
  )
}

function MoreSheet({
  data,
  site,
  onShare,
  onClose,
  onReport,
}: {
  data: PublicRestaurant
  site: string | null
  onShare: () => void
  onClose: () => void
  onReport?: (text: string) => Promise<void> | void
}) {
  const row = 'flex w-full items-center gap-3 border-t border-border py-3 text-left text-[15px] font-semibold first:border-t-0'
  return (
    <Sheet label="More" onClose={onClose}>
      <h2 className="font-serif text-2xl font-bold">{data.name}</h2>
      <div className="mt-3 flex flex-col">
        {site && (
          <a className={row} href={site} target="_blank" rel="noopener noreferrer">
            🌐 Website <span className="ml-auto text-sm font-normal text-muted-foreground">{siteLabel(site)}</span>
          </a>
        )}
        <button type="button" className={row} onClick={onShare}>🔗 Share or copy link</button>
        <a className={row} href={directionsUrl(data)} target="_blank" rel="noopener noreferrer">📍 Directions</a>
        {onReport ? (
          <p className={`${row} text-muted-foreground`}>🚩 Report a problem — on the Info tab</p>
        ) : (
          <p className={`${row} font-normal text-muted-foreground`}>🚩 Sign in to report a problem</p>
        )}
        <p className="pt-2 text-xs text-muted-foreground">
          {priceText(data.price_level) ? `${priceText(data.price_level)} · ` : ''}Totals come from groups on Crumbs — never names.
        </p>
      </div>
    </Sheet>
  )
}

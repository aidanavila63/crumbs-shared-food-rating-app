'use client'
// "From the restaurant" on a place: what its verified owner posted — today's specials, limited-time
// items, closures and holiday hours, news (#153 #154 #155).
import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { currentPosts, datesText, daysText, type RestaurantPost } from '@/lib/posts'

const today = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)
const DEMO: RestaurantPost[] = [
  {
    id: 'demo-p1',
    restaurant_id: 'x',
    kind: 'special',
    title: 'Half-price gyoza',
    body: '3–6pm',
    weekdays: [today.getDay()],
    starts_on: null,
    ends_on: null,
    created_at: iso(today),
  },
  {
    id: 'demo-p2',
    restaurant_id: 'x',
    kind: 'limited',
    title: 'Pumpkin miso ramen',
    body: 'Only while the pumpkins last',
    weekdays: null,
    starts_on: iso(new Date(today.getTime() - 5 * 864e5)),
    ends_on: iso(new Date(today.getTime() + 20 * 864e5)),
    created_at: iso(today),
  },
  {
    id: 'demo-p3',
    restaurant_id: 'x',
    kind: 'closure',
    title: 'Closed for a family wedding',
    body: null,
    weekdays: null,
    starts_on: iso(new Date(today.getTime() + 9 * 864e5)),
    ends_on: iso(new Date(today.getTime() + 10 * 864e5)),
    created_at: iso(today),
  },
]

export function RestaurantPosts({
  restaurantId,
  supabase,
  demo,
  verified,
}: {
  restaurantId: string
  supabase: any
  demo: boolean
  verified: boolean
}) {
  const [posts, setPosts] = useState<RestaurantPost[]>(demo && verified ? DEMO : [])
  useEffect(() => {
    let cancelled = false
    if (demo) {
      Promise.resolve().then(() => !cancelled && setPosts(verified ? DEMO : []))
      return () => {
        cancelled = true
      }
    }
    if (!verified) return
    supabase
      .from('restaurant_posts')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }: any) => !cancelled && setPosts(data ?? []))
    return () => {
      cancelled = true
    }
  }, [demo, restaurantId, supabase, verified])
  const c = currentPosts(posts)
  const any =
    c.today.length + c.weekly.length + c.limited.length + c.closures.length + c.news.length
  if (!any) return null
  return (
    <div className="surface-soft from-owner flex flex-col gap-2">
      <h3 className="flex items-center gap-1 font-serif text-xl font-bold">
        From the restaurant
        <BadgeCheck size={16} className="verified-icon" aria-label="Verified by Owner" />
      </h3>
      {c.closures.map((p) => (
        <p key={p.id} className="text-sm font-semibold text-destructive">
          {p.body ? '🕒' : '🚫'} {p.title} · {datesText(p.starts_on, p.ends_on)}
          {p.body ? <span className="block font-normal">{p.body}</span> : null}
        </p>
      ))}
      {c.today.map((p) => (
        <p key={p.id} className="text-sm">
          <span className="tag mr-1">TODAY</span>
          <strong>{p.title}</strong>
          {p.body ? ` — ${p.body}` : ''}
        </p>
      ))}
      {c.limited.map((p) => (
        <p key={p.id} className="text-sm">
          <span className="tag mr-1">LIMITED</span>
          <strong>{p.title}</strong>
          {p.body ? ` — ${p.body}` : ''}
          {p.ends_on ? (
            <span className="text-muted-foreground"> · {datesText(null, p.ends_on)}</span>
          ) : null}
        </p>
      ))}
      {c.weekly.map((p) => (
        <p key={p.id} className="text-sm text-muted-foreground">
          📅 {daysText(p.weekdays)}: <strong className="text-foreground">{p.title}</strong>
          {p.body ? ` — ${p.body}` : ''}
        </p>
      ))}
      {c.news.map((p) => (
        <p key={p.id} className="text-sm">
          📣 <strong>{p.title}</strong>
          {p.body ? ` — ${p.body}` : ''}
        </p>
      ))}
    </div>
  )
}

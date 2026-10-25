// #153 #154 #155 What a restaurant's owner posts: news, weekly specials, limited-time items and
// holiday closures / hours. Worked out for "today" on the phone.
export type PostKind = 'news' | 'special' | 'limited' | 'closure'
export type RestaurantPost = {
  id: string
  restaurant_id: string
  kind: PostKind
  title: string
  body: string | null
  weekdays: number[] | null
  starts_on: string | null
  ends_on: string | null
  created_at: string
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** What's on now: today's specials first, then other weekly specials, limited items running,
 *  closures today or in the next 30 days, and news from the last 30 days (or until it ends). */
export function currentPosts(posts: RestaurantPost[], now = new Date()) {
  const today = iso(now)
  const soon = iso(new Date(now.getTime() + 30 * 864e5))
  const monthAgo = new Date(now.getTime() - 30 * 864e5).toISOString()
  const active = (p: RestaurantPost) =>
    (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today)
  const specials = posts.filter((p) => p.kind === 'special' && active(p))
  const dow = now.getDay()
  return {
    today: specials.filter((p) => !p.weekdays?.length || p.weekdays.includes(dow)),
    weekly: specials.filter((p) => p.weekdays?.length && !p.weekdays.includes(dow)),
    limited: posts.filter((p) => p.kind === 'limited' && active(p)),
    closures: posts
      .filter(
        (p) =>
          p.kind === 'closure' &&
          (p.ends_on ?? p.starts_on ?? today) >= today &&
          (p.starts_on ?? today) <= soon,
      )
      .sort((a, b) => (a.starts_on ?? '').localeCompare(b.starts_on ?? '')),
    news: posts.filter(
      (p) => p.kind === 'news' && (p.ends_on ? p.ends_on >= today : p.created_at >= monthAgo),
    ),
  }
}

/** "Tue, Thu" / "every day". */
export const daysText = (days: number[] | null) =>
  !days?.length
    ? 'every day'
    : days.length === 7
      ? 'every day'
      : [...days]
          .sort()
          .map((d) => DAY_SHORT[d])
          .join(', ')

/** "Dec 24 – Dec 26" / "until Nov 30" / "from Dec 1". */
export function datesText(start: string | null, end: string | null) {
  const f = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (start && end) return start === end ? f(start) : `${f(start)} – ${f(end)}`
  if (end) return `until ${f(end)}`
  if (start) return `from ${f(start)}`
  return ''
}

/** Is the restaurant closed today because of a posted closure? */
export const closedToday = (posts: RestaurantPost[], now = new Date()) =>
  currentPosts(posts, now).closures.some(
    (p) =>
      (p.starts_on ?? iso(now)) <= iso(now) &&
      (p.ends_on ?? p.starts_on ?? iso(now)) >= iso(now) &&
      !p.body,
  )

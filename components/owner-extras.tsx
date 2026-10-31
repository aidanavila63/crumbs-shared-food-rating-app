'use client'
// Owner tools on "Your restaurants": #153–#155 posts (news, weekly specials, limited-time items,
// closures and holiday hours), #211 insights from all of Crumbs (totals only), #212 a "Find us on
// Crumbs" poster with a QR code that adds the restaurant to the scanner's group.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, Trash2 } from 'lucide-react'
import { DAY_SHORT, datesText, daysText, type PostKind, type RestaurantPost } from '@/lib/posts'
import { haptic } from '@/lib/motion'

const KINDS: { id: PostKind; label: string; hint: string }[] = [
  { id: 'special', label: '📅 Weekly special', hint: 'e.g. Half-price wings — Tue & Thu' },
  { id: 'limited', label: '⏳ Limited time', hint: 'e.g. Pumpkin ramen — until Nov 30' },
  { id: 'closure', label: '🚫 Closed / holiday hours', hint: 'e.g. Closed Dec 24–26' },
  { id: 'news', label: '📣 News', hint: 'e.g. New patio is open' },
]

export function OwnerPosts({
  restaurantId,
  supabase,
  demo,
}: {
  restaurantId: string
  supabase: any
  demo: boolean
}) {
  const [posts, setPosts] = useState<RestaurantPost[]>([])
  const [kind, setKind] = useState<PostKind | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  useEffect(() => {
    if (demo) return
    let cancelled = false
    supabase
      .from('restaurant_posts')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => !cancelled && setPosts(data ?? []))
    return () => {
      cancelled = true
    }
  }, [demo, restaurantId, supabase])

  async function save() {
    if (!kind || !title.trim()) return toast('Add a title')
    if ((kind === 'limited' || kind === 'closure') && !start && !end) return toast('Add the dates')
    const row = {
      restaurant_id: restaurantId,
      kind,
      title: title.trim().slice(0, 80),
      body: body.trim().slice(0, 400) || null,
      weekdays: kind === 'special' && days.length ? days : null,
      starts_on: start || null,
      ends_on: end || (kind === 'closure' ? start || null : null),
    }
    let saved: RestaurantPost = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...row,
    }
    if (!demo) {
      const { data, error } = await supabase
        .from('restaurant_posts')
        .insert(row)
        .select('*')
        .single()
      if (error) return toast.error(error.message)
      saved = data
    }
    haptic('success')
    toast.success('Posted — everyone who saves your restaurant sees it')
    setPosts((all) => [saved, ...all])
    setKind(null)
    setTitle('')
    setBody('')
    setDays([])
    setStart('')
    setEnd('')
  }
  async function remove(p: RestaurantPost) {
    setPosts((all) => all.filter((x) => x.id !== p.id))
    if (!demo) await supabase.from('restaurant_posts').delete().eq('id', p.id)
  }

  return (
    <section className="surface flex flex-col gap-3">
      <h3 className="font-serif text-xl font-bold">Specials & news</h3>
      <p className="text-xs text-muted-foreground">
        Shows as “From the restaurant” on your page for everyone who saved it.
      </p>
      <div className="chip-row">
        {KINDS.map((k) => (
          <button
            key={k.id}
            aria-pressed={kind === k.id}
            className={`chip chip-sm ${kind === k.id ? 'chip-active' : ''}`}
            onClick={() => setKind(kind === k.id ? null : k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind && (
        <div className="rise-panel flex flex-col gap-2">
          <input
            className="field"
            placeholder={KINDS.find((k) => k.id === kind)!.hint}
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className="field"
            placeholder={
              kind === 'closure'
                ? 'Special hours instead? (e.g. Open 12–4) — optional'
                : 'Details (optional)'
            }
            maxLength={400}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {kind === 'special' && (
            <div className="chip-row" aria-label="Which days">
              {DAY_SHORT.map((d, i) => (
                <button
                  key={d}
                  aria-pressed={days.includes(i)}
                  className={`chip chip-sm ${days.includes(i) ? 'chip-active' : ''}`}
                  onClick={() =>
                    setDays((all) => (all.includes(i) ? all.filter((x) => x !== i) : [...all, i]))
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          {kind !== 'special' && (
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs">
                From
                <input
                  className="field"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs">
                {kind === 'news' ? 'Show until (optional)' : 'Until'}
                <input
                  className="field"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
          )}
          <button className="primary" onClick={save}>
            Post it
          </button>
        </div>
      )}
      {posts.map((p) => (
        <div key={p.id} className="surface-soft flex items-start justify-between gap-2 text-sm">
          <span className="min-w-0">
            <strong>{p.title}</strong>
            {p.body ? ` — ${p.body}` : ''}
            <span className="block text-xs text-muted-foreground">
              {KINDS.find((k) => k.id === p.kind)?.label}
              {p.kind === 'special' ? ` · ${daysText(p.weekdays)}` : ''}
              {p.starts_on || p.ends_on ? ` · ${datesText(p.starts_on, p.ends_on)}` : ''}
            </span>
          </span>
          <button
            aria-label={`Delete ${p.title}`}
            className="icon-btn shrink-0"
            onClick={() => remove(p)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </section>
  )
}

type OwnerStats = {
  saved: number
  want_to_try: number
  been: number
  visits: number
  by_month: { month: string; visits: number }[] | null
  per_head_by_quarter: { quarter: string; per_head: number }[]
  rating: number | null
  ratings: number
  top_dishes: { name: string; confirms: number }[]
}
const DEMO_STATS: OwnerStats = {
  saved: 14,
  want_to_try: 6,
  been: 8,
  visits: 31,
  by_month: [
    { month: '2026-06', visits: 3 },
    { month: '2026-07', visits: 5 },
    { month: '2026-08', visits: 4 },
    { month: '2026-09', visits: 8 },
    { month: '2026-10', visits: 11 },
  ],
  per_head_by_quarter: [
    { quarter: '2026-Q2', per_head: 22 },
    { quarter: '2026-Q3', per_head: 24 },
  ],
  rating: 4.4,
  ratings: 17,
  top_dishes: [
    { name: 'Tonkotsu Ramen', confirms: 9 },
    { name: 'Pork gyoza', confirms: 6 },
  ],
}

/** #211 Totals from everyone on Crumbs (never which groups). */
export function OwnerInsights({
  restaurantId,
  supabase,
  demo,
}: {
  restaurantId: string
  supabase: any
  demo: boolean
}) {
  const [s, setS] = useState<OwnerStats | null>(demo ? DEMO_STATS : null)
  useEffect(() => {
    if (demo) return
    let cancelled = false
    supabase
      .rpc('owner_insights', { target: restaurantId })
      .then(({ data }: any) => !cancelled && data && setS(data))
    return () => {
      cancelled = true
    }
  }, [demo, restaurantId, supabase])
  if (!s) return null
  const max = Math.max(1, ...(s.by_month ?? []).map((m) => m.visits))
  return (
    <section className="surface flex flex-col gap-3">
      <h3 className="font-serif text-xl font-bold">How you’re doing on Crumbs</h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            [s.saved, 'saved you'],
            [s.want_to_try, 'want to try'],
            [s.visits, 'visits'],
          ] as const
        ).map(([n, label]) => (
          <div key={label} className="surface-soft !p-2">
            <p className="font-serif text-2xl text-primary">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {s.rating !== null && (
        <p className="text-sm">
          Average rating <strong>{s.rating}★</strong> from {s.ratings} ratings
        </p>
      )}
      {s.by_month?.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted-foreground">Visits by month</p>
          <div className="owner-bars" role="img" aria-label="Visits by month">
            {s.by_month.map((m) => (
              <span key={m.month} className="owner-bar-col">
                <span className="owner-bar" style={{ height: `${(m.visits / max) * 100}%` }} />
                <span className="text-[0.65rem] text-muted-foreground">
                  {new Date(`${m.month}-15`).toLocaleDateString(undefined, { month: 'short' })}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Monthly visits show once 5+ are logged.</p>
      )}
      {s.per_head_by_quarter.length > 0 && (
        <p className="text-sm">
          About a person:{' '}
          {s.per_head_by_quarter
            .map((q) => `${q.quarter.replace('-', ' ')} $${q.per_head}`)
            .join(' → ')}
        </p>
      )}
      {s.top_dishes.length > 0 && (
        <p className="text-sm">
          Most confirmed dishes: {s.top_dishes.map((d) => `${d.name} (${d.confirms})`).join(', ')}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Totals from everyone on Crumbs — never who.</p>
    </section>
  )
}

/** #212 "Find us on Crumbs" poster: a QR code that adds your restaurant to the scanner's group.
 *  Brand look: cookie-cream page, the Crumbs wordmark, Fredoka lettering, the Crumbs QR (plum dots, cookie + crumbs). */
export function OwnerPoster({ restaurantId, name }: { restaurantId: string; name: string }) {
  const [busy, setBusy] = useState(false)
  async function make() {
    setBusy(true)
    try {
      const link = `${window.location.origin}/?add=${restaurantId}`
      const [{ brandQrSvg, svgDataUrl }, { wordmarkSvg }] = await Promise.all([
        import('@/lib/brand-qr'),
        import('./wordmark'),
      ])
      const load = (src: string) =>
        new Promise<HTMLImageElement>((ok, bad) => {
          const img = new Image()
          img.onload = () => ok(img)
          img.onerror = bad
          img.src = src
        })
      const fam =
        getComputedStyle(document.body).getPropertyValue('--font-fredoka').trim() ||
        'Fredoka, system-ui, sans-serif'
      const [qr, word] = await Promise.all([
        brandQrSvg(link, { size: 1000, label: `QR code that adds ${name} on Crumbs` }).then((svg) =>
          load(svgDataUrl(svg)),
        ),
        load(svgDataUrl(wordmarkSvg())),
        ...['400', '500', '600'].map((w) => document.fonts.load(`${w} 48px ${fam}`).catch(() => [])),
      ])
      const W = 1240
      const H = 1754
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#FBF4E8'
      ctx.fillRect(0, 0, W, H)
      // wordmark leads
      const ww = 600
      const wh = ww / (word.naturalWidth / word.naturalHeight || 4.87)
      ctx.drawImage(word, (W - ww) / 2, 110, ww, wh)
      const line = (text: string, weight: number, px: number, y: number, color: string, maxW = 1080) => {
        let size = px
        ctx.font = `${weight} ${size}px ${fam}`
        while (ctx.measureText(text).width > maxW && size > 28) {
          size -= 2
          ctx.font = `${weight} ${size}px ${fam}`
        }
        ctx.fillStyle = color
        ctx.textAlign = 'center'
        ctx.fillText(text, W / 2, y)
      }
      line(name.slice(0, 40), 600, 92, 110 + wh + 150, '#1C2A23')
      line('Find us on Crumbs', 500, 50, 110 + wh + 228, '#7B2D5B')
      const q = 860
      const qy = 110 + wh + 290
      ctx.drawImage(qr, (W - q) / 2, qy, q, q)
      line('Scan to save us to your group,', 500, 54, qy + q + 110, '#1C2A23')
      line('rate your favourite dishes and see our specials.', 400, 40, qy + q + 175, '#5F6E65')
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${name.replace(/[^\w -]/g, '').trim() || 'crumbs'}-poster.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      haptic('success')
    } catch {
      toast.error('Could not make the poster')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">“Find us on Crumbs” poster</h3>
      <p className="text-sm text-muted-foreground">
        A printable poster with a QR code. Scanning it opens Crumbs and adds {name} to that person’s
        group.
      </p>
      <button
        className="secondary flex items-center justify-center gap-2"
        disabled={busy}
        onClick={make}
      >
        <Download size={16} /> {busy ? 'Making it…' : 'Download poster'}
      </button>
    </section>
  )
}

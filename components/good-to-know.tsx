'use client'
// "Good to know" on a place: what Crumbs members have confirmed about the restaurant (paying,
// bookings, patio, family, access, diet options…), notes on the entrance and parking, deals and a
// storefront photo. Anyone who's been can answer yes/no; it shows once 2 agree — or straight away from
// a Builder or admin. The owner's answer wins.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { ATTRS, knownFacts, type AttrKey, type AttrSummary } from '@/lib/good-to-know'
import { photoUrl } from '@/lib/photos'
import { haptic } from '@/lib/motion'
import { PhotoButton } from './photo-button'
import { timeAgo } from './social'

type Tip = {
  id: string
  kind: 'entrance' | 'parking' | 'deal' | 'storefront'
  body: string | null
  photo_path: string | null
  user_id: string | null
  created_at: string
  restaurant_tip_votes?: { user_id: string; still: boolean }[]
}

const KIND_LABEL: Record<Tip['kind'], string> = {
  entrance: '🚪 Finding the door',
  parking: '🅿️ Parking',
  deal: '🏷️ Deal / happy hour',
  storefront: '🏪 Storefront photo',
}

const DEMO_SUMMARY: AttrSummary = {
  attrs: {
    cards: { yes: 3, no: 0, mine: null, owner: null, verdict: true },
    patio: { yes: 2, no: 0, mine: true, owner: null, verdict: true },
    late_night: { yes: 1, no: 0, mine: null, owner: null, verdict: true },
    takes_bookings: { yes: 0, no: 2, mine: null, owner: null, verdict: false },
  },
  groups: {
    loud: true,
    hard_parking: false,
    long_wait: false,
    cash_only: false,
    not_accessible: false,
  },
}
const DEMO_TIPS: Tip[] = [
  {
    id: 'demo-tip-1',
    kind: 'deal',
    body: 'Tue–Thu 3–6pm: half-price gyoza',
    photo_path: null,
    user_id: 'x',
    created_at: new Date(Date.now() - 12 * 864e5).toISOString(),
    restaurant_tip_votes: [
      { user_id: 'a', still: true },
      { user_id: 'b', still: true },
    ],
  },
  {
    id: 'demo-tip-2',
    kind: 'entrance',
    body: 'Door is around the side, under the red lantern',
    photo_path: null,
    user_id: 'y',
    created_at: new Date(Date.now() - 40 * 864e5).toISOString(),
  },
]

export function GoodToKnow({
  restaurantId,
  groupId,
  userId,
  supabase,
  demo,
}: {
  restaurantId: string
  groupId: string
  userId?: string
  supabase: any
  demo: boolean
}) {
  const [summary, setSummary] = useState<AttrSummary | null>(demo ? DEMO_SUMMARY : null)
  const [tips, setTips] = useState<Tip[]>(demo ? DEMO_TIPS : [])
  const [helping, setHelping] = useState(false)
  const [adding, setAdding] = useState<Tip['kind'] | null>(null)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (demo) return
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.rpc('restaurant_attrs', { target: restaurantId }),
      supabase
        .from('restaurant_tips')
        .select('id,kind,body,photo_path,user_id,created_at,restaurant_tip_votes(user_id,still)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    if (s) setSummary(s)
    setTips(t ?? [])
  }, [demo, restaurantId, supabase])
  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function answer(key: AttrKey, value: boolean) {
    const current = summary?.attrs[key]?.mine ?? null
    const next = current === value ? null : value
    haptic('select')
    if (demo) {
      setSummary((s) => {
        const prev = s?.attrs[key] ?? { yes: 0, no: 0, mine: null, owner: null, verdict: null }
        const yes = prev.yes - (prev.mine === true ? 1 : 0) + (next === true ? 1 : 0)
        const no = prev.no - (prev.mine === false ? 1 : 0) + (next === false ? 1 : 0)
        // demo: you're an admin here, so your answer counts straight away
        const verdict =
          next !== null ? next : yes >= 2 && yes > no ? true : no >= 2 && no > yes ? false : null
        return { ...s!, attrs: { ...s!.attrs, [key]: { ...prev, yes, no, mine: next, verdict } } }
      })
      return
    }
    const { data, error } = await supabase.rpc('set_restaurant_attr', {
      target: restaurantId,
      attr: key,
      val: next,
    })
    if (error) return toast.error(error.message)
    setSummary(data)
    const shown = data?.attrs?.[key]?.verdict
    if (data?.points)
      toast.success(
        next !== null && shown !== next
          ? `Thanks! +${data.points} point${data.points === 1 ? '' : 's'} — it shows once someone else agrees`
          : `Thanks! +${data.points} point${data.points === 1 ? '' : 's'}`,
      )
  }

  async function addTip() {
    if (!adding || (!text.trim() && !photo)) return
    if (demo) {
      setTips((all) => [
        {
          id: crypto.randomUUID(),
          kind: adding,
          body: text.trim() || null,
          photo_path: photo,
          user_id: userId ?? null,
          created_at: new Date().toISOString(),
        },
        ...all,
      ])
    } else {
      const { error } = await supabase.rpc('add_restaurant_tip', {
        target: restaurantId,
        tip_kind: adding,
        tip_body: text.trim(),
        photo,
      })
      if (error) return toast.error(error.message)
      await load()
    }
    haptic('success')
    toast.success('Thanks — everyone who saves this place will see it')
    setAdding(null)
    setText('')
    setPhoto(null)
  }

  async function stillOn(tip: Tip, still: boolean) {
    haptic('select')
    const others = (tip.restaurant_tip_votes ?? []).filter((v) => v.user_id !== userId)
    setTips((all) =>
      all.map((t) =>
        t.id === tip.id
          ? { ...t, restaurant_tip_votes: [...others, { user_id: userId ?? 'me', still }] }
          : t,
      ),
    )
    if (demo) return
    const { error } = await supabase
      .from('restaurant_tip_votes')
      .upsert({ tip_id: tip.id, still, created_at: new Date().toISOString() })
    if (error) toast.error(error.message)
  }

  async function removeTip(tip: Tip) {
    setTips((all) => all.filter((t) => t.id !== tip.id))
    if (!demo) await supabase.from('restaurant_tips').delete().eq('id', tip.id)
  }

  const facts = knownFacts(summary)
  const storefront = tips.find((t) => t.kind === 'storefront' && t.photo_path)
  // Deals most people say are gone are hidden.
  const shown = tips.filter((t) => {
    if (t.kind === 'storefront') return false
    const votes = t.restaurant_tip_votes ?? []
    return votes.filter((v) => !v.still).length <= votes.filter((v) => v.still).length
  })
  const notes = (['entrance', 'parking', 'deal'] as const).map((kind) => ({
    kind,
    list: shown.filter((t) => t.kind === kind).slice(0, kind === 'deal' ? 4 : 2),
  }))

  return (
    <div className="surface-soft flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-xl font-bold">Good to know</h3>
        <button
          className="text-sm font-semibold text-primary underline"
          onClick={() => setHelping(!helping)}
        >
          {helping ? 'Done' : 'Add what you know'}
        </button>
      </div>
      {storefront && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl(storefront.photo_path)!}
          alt="Storefront"
          className="h-36 w-full rounded-2xl object-cover"
          loading="lazy"
        />
      )}
      {facts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <span key={f.label} className={`tag ${f.warn ? 'tag-warn' : ''}`}>
              {f.emoji} {f.label}
              {f.owner ? ' ✓' : ''}
            </span>
          ))}
        </div>
      ) : (
        !helping && (
          <p className="text-sm text-muted-foreground">
            Nothing confirmed yet — been here? Tap “Add what you know”.
          </p>
        )
      )}
      {notes.map(({ kind, list }) =>
        list.map((tip) => {
          const votes = tip.restaurant_tip_votes ?? []
          const yes = votes.filter((v) => v.still).length
          const mine = votes.find((v) => v.user_id === userId)?.still
          return (
            <div key={tip.id} className="flex flex-col gap-1 text-sm">
              <p>
                <span className="font-semibold">
                  {KIND_LABEL[kind].split(' ').slice(1).join(' ')}:
                </span>{' '}
                {tip.body}
                <span className="text-xs text-muted-foreground"> · {timeAgo(tip.created_at)}</span>
              </p>
              {tip.photo_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl(tip.photo_path)!}
                  alt=""
                  className="h-28 w-40 rounded-xl object-cover"
                  loading="lazy"
                />
              )}
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {kind === 'deal' && (
                  <>
                    Still on?
                    <button
                      aria-pressed={mine === true}
                      className={`reason-chip ${mine === true ? 'reason-chip-on' : ''}`}
                      onClick={() => stillOn(tip, true)}
                    >
                      Yes{yes ? ` · ${yes}` : ''}
                    </button>
                    <button
                      aria-pressed={mine === false}
                      className={`reason-chip ${mine === false ? 'reason-chip-on' : ''}`}
                      onClick={() => stillOn(tip, false)}
                    >
                      Gone
                    </button>
                  </>
                )}
                {tip.user_id === userId && (
                  <button className="underline" onClick={() => removeTip(tip)}>
                    Delete
                  </button>
                )}
              </span>
            </div>
          )
        }),
      )}
      {helping && (
        <div className="rise-panel flex flex-col gap-3 border-t border-[var(--border)] pt-3">
          {[...new Set(ATTRS.map((a) => a.group))].map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group}
              </p>
              {ATTRS.filter((a) => a.group === group).map((a) => {
                const s = summary?.attrs[a.key]
                return (
                  <div key={a.key} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {a.emoji} {a.question}
                      {s && (s.yes || s.no) ? (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · {s.yes} yes, {s.no} no
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        aria-label={`${a.question} Yes`}
                        aria-pressed={s?.mine === true}
                        className={`yn-btn ${s?.mine === true ? 'yn-yes' : ''}`}
                        onClick={() => answer(a.key, true)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        aria-label={`${a.question} No`}
                        aria-pressed={s?.mine === false}
                        className={`yn-btn ${s?.mine === false ? 'yn-no' : ''}`}
                        onClick={() => answer(a.key, false)}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Notes for everyone
            </p>
            <div className="chip-row">
              {(Object.keys(KIND_LABEL) as Tip['kind'][]).map((kind) => (
                <button
                  key={kind}
                  aria-pressed={adding === kind}
                  className={`chip chip-sm ${adding === kind ? 'chip-active' : ''}`}
                  onClick={() => setAdding(adding === kind ? null : kind)}
                >
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            {adding && (
              <div className="rise-panel flex flex-col gap-2">
                {adding !== 'storefront' && (
                  <input
                    className="field"
                    maxLength={300}
                    placeholder={
                      adding === 'entrance'
                        ? 'e.g. Door is around the side, up the stairs'
                        : adding === 'parking'
                          ? 'e.g. Free lot behind, street parking after 6'
                          : 'e.g. Tue–Thu 3–6pm half-price wings'
                    }
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                )}
                <PhotoButton
                  label={KIND_LABEL[adding]}
                  path={photo}
                  groupId={groupId}
                  supabase={supabase}
                  demo={demo}
                  compact
                  onChange={(path) => {
                    setPhoto(path)
                    return true
                  }}
                />
                <button
                  className="primary"
                  disabled={adding === 'storefront' ? !photo : !text.trim() && !photo}
                  onClick={addTip}
                >
                  Share with everyone
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Your answers are private — only totals show. New info earns points.
          </p>
        </div>
      )}
    </div>
  )
}

'use client'
import { refreshPublicPages } from '@/lib/refresh-public'
// "Your restaurants": the area for verified owners (#100). Each page they run: what members
// suggest (grouped, never who), every detail, and the menu — add, fix prices, remove dishes.
// Price level isn't set by hand: it follows the menu's prices.
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  contributeFact,
  keepDishPrice,
  keepOwnerValue,
  loadInsights,
  loadMenu,
  loadMenuSections,
  loadRestaurant,
  myRestaurants,
  ownerEditDish,
  ownerSuggestions,
  dishKey,
  type FactField,
  type Insights,
  type MenuDish,
  type MenuSection,
  type OwnedRestaurant,
  type Restaurant,
  type Suggestion,
} from '@/lib/restaurants'
import { hoursToText, localUtcOffset } from '@/lib/hours-text'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { Overlay } from './overlay'
import { FactEditor, STATUS, VerifiedBadge } from './restaurant-profile'
import { OwnerBooking, OwnerInsights, OwnerPosts, OwnerPoster, OwnerSpecialHours } from './owner-extras'
import { OwnerMenuPdf } from './menu-pdf'
import { OwnerTeam } from './owner-team'
import { OwnerMenu } from './owner-menu-editor'
import { OwnerHeadsUps } from './plan-headsup'
import {
  OwnerBigChange,
  OwnerPastePrices,
  OwnerPriceChange,
  OwnerSiteBadge,
  OwnerTableQr,
  OwnerTags,
  OwnerTaps,
  useOwnerTools,
} from './owner-tools'

const FIELDS: FactField[] = ['address', 'hours', 'phone', 'website', 'cuisine', 'status']
const LABEL: Partial<Record<FactField, string>> = {
  address: 'Address',
  hours: 'Hours',
  phone: 'Phone',
  website: 'Website',
  cuisine: 'Cuisine',
  status: 'Open?',
  name: 'Name',
}
function valueOf(r: Restaurant, f: FactField): unknown {
  if (f === 'address') return r.formatted_address
  if (f === 'hours') return r.opening_hours
  if (f === 'status') return r.business_status
  return (r as any)[f] ?? null
}
function showValue(f: FactField, v: unknown) {
  if (v === null || v === undefined || v === '') return null
  if (f === 'location') return 'Map pin in a different spot'
  if (f === 'hours') return hoursToText(v as Hours) || null
  if (f === 'status') return STATUS.find((s) => s.id === v)?.label ?? String(v)
  return String(v)
}

// ---------- demo data (no database) ----------
const DEMO_LIST: OwnedRestaurant[] = [
  {
    id: 'demo-owned',
    name: 'Jordan’s Kitchen',
    address: '12 Queen St W',
    saves: 14,
    dishes: 3,
    flagged: 1,
    suggestions: 1,
  },
]
const demoRestaurant = (): Restaurant =>
  ({
    id: 'demo-owned',
    source_key: 'demo-owned',
    name: 'Jordan’s Kitchen',
    formatted_address: '12 Queen St W',
    latitude: null,
    longitude: null,
    cuisine: 'Comfort food',
    price_level: 2,
    website: 'https://jordanskitchen.example',
    phone: '+1 416 555 0123',
    google_maps_url: null,
    opening_hours: {
      utc: -240,
      periods: [1, 2, 3, 4, 5].map((d) => ({ o: [d, 11, 0], c: [d, 21, 0] })),
    } as Hours,
    business_status: 'OPERATIONAL',
    hours_checked_at: null,
    details_checked_at: null,
    places_count: 14,
    owner_verified: true,
    owner_tags: ['Family-run', 'Since 2009'],
    sources: {
      address: 'owner',
      hours: 'owner',
      phone: 'owner',
      website: 'owner',
      cuisine: 'owner',
      price_level: 'owner',
    },
  }) as Restaurant
const demoMenu = (): MenuDish[] =>
  (
    [
      ['Brisket Sandwich', 17, 'main', true, false],
      ['Mac & Cheese', 14, 'main', true, false],
      ['Fried Pickles', 8, 'starter', false, true],
    ] as const
  ).map(([name, price, course, owner_ok, hidden], i) => ({
    id: `demo-owned-${i}`,
    restaurant_id: 'demo-owned',
    name,
    name_key: dishKey(name),
    price,
    description: null,
    course,
    dietary: [],
    source: 'photo',
    owner_ok,
    confirms: owner_ok ? 3 : 0,
    flags: hidden ? 2 : 0,
    hidden,
    price_checked_at: new Date().toISOString(),
    section_id: i < 2 ? 'demo-cat-mains' : null,
    position: i,
  })) as MenuDish[]
const demoSections = (): MenuSection[] => [
  { id: 'demo-cat-mains', restaurant_id: 'demo-owned', name: 'Smokehouse', name_local: null, menu_name: null, position: 0, display: { effect: 'list' } },
]

/** The list of pages you run; tap one to manage it. */
export function OwnerPanel({ supabase, demo }: { supabase: any; demo: boolean }) {
  // E14 (Round 77): leaving the owner tools refreshes the public restaurant pages straight away.
  useEffect(() => () => refreshPublicPages('restaurant'), [])
  const [list, setList] = useState<OwnedRestaurant[] | null>(demo ? DEMO_LIST : null)
  const [open, setOpen] = useState<OwnedRestaurant | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (demo) return
    let cancelled = false
    myRestaurants(supabase).then((rows) => !cancelled && setList(rows))
    return () => {
      cancelled = true
    }
  }, [demo, supabase, round])

  return (
    <div className="stagger flex flex-col gap-3">
      <div className="surface flex flex-col gap-2">
        <VerifiedBadge />
        <p className="text-sm text-muted-foreground">
          Your pages show <strong>Verified by Owner</strong> to everyone on Crumbs. Only you can
          change their details; members can still send you suggestions. Your profile just says
          “Restaurant owner” — never which one.
        </p>
      </div>
      {list === null && <div className="skeleton h-20" />}
      {list?.length === 0 && (
        <p className="empty text-sm text-muted-foreground">
          No restaurants yet. Claim yours from its page: “Something wrong or missing?” → “Own or
          manage this place?”.
        </p>
      )}
      {list?.map((r) => (
        <button
          key={r.id}
          className="owner-row"
          onClick={() => {
            haptic('tap')
            setOpen(r)
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-xl font-bold">{r.name}</span>
            <span className="block text-xs text-muted-foreground">
              {[
                r.address,
                `saved by ${r.saves} group${r.saves === 1 ? '' : 's'}`,
                `${r.dishes} dish${r.dishes === 1 ? '' : 'es'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {(r.suggestions > 0 || r.flagged > 0) && (
              <span className="mt-1 block text-xs font-bold text-primary">
                {[
                  r.suggestions
                    ? `${r.suggestions} suggestion${r.suggestions === 1 ? '' : 's'}`
                    : '',
                  r.flagged ? `${r.flagged} dish${r.flagged === 1 ? '' : 'es'} flagged` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
        </button>
      ))}
      {open && (
        <Overlay
          label={`Manage ${open.name}`}
          title={open.name}
          onClose={() => {
            setOpen(null)
            setRound((n) => n + 1)
          }}
        >
          <OwnerRestaurant id={open.id} supabase={supabase} demo={demo} />
        </Overlay>
      )}
    </div>
  )
}

function OwnerRestaurant({ id, supabase, demo }: { id: string; supabase: any; demo: boolean }) {
  const [r, setR] = useState<Restaurant | null>(demo ? demoRestaurant() : null)
  const [menu, setMenu] = useState<MenuDish[]>(demo ? demoMenu() : [])
  const [sections, setSections] = useState<MenuSection[]>(demo ? demoSections() : [])
  const [suggestions, setSuggestions] = useState<Suggestion[]>(
    demo
      ? [
          {
            field: 'hours',
            value: {
              utc: -240,
              periods: [1, 2, 3, 4, 5, 6].map((d) => ({ o: [d, 11, 0], c: [d, 22, 0] })),
            },
            people: 2,
            photo: true,
            latest: new Date().toISOString(),
          },
          {
            field: 'dish_price',
            dish_id: 'demo-owned-0',
            dish: 'Brisket Sandwich',
            current: 17,
            value: 18.5,
            people: 3,
            photo: true,
            latest: new Date().toISOString(),
          },
        ]
      : [],
  )
  const [insights, setInsights] = useState<Insights | null>(
    demo ? { visits: 31, groups: 9, per_head: 26, takeout_share: 40 } : null,
  )
  const [editing, setEditing] = useState<FactField | null>(null)
  // Round 89: tap counts and the page's link (for the table QR)
  const tools = useOwnerTools(supabase, id, demo)

  async function reload() {
    if (demo) return
    const [fresh, m, s, cats] = await Promise.all([
      loadRestaurant(supabase, id),
      loadMenu(supabase, id),
      ownerSuggestions(supabase, id).catch(() => []),
      loadMenuSections(supabase, id),
    ])
    setR(fresh)
    setMenu(m.menu)
    setSuggestions(s)
    setSections(cats)
  }
  useEffect(() => {
    if (demo) return
    reload()
    loadInsights(supabase, id).then(setInsights)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, demo])

  async function setFact(fact: FactField, val: unknown) {
    try {
      if (demo) {
        const column: Record<string, string> = {
          address: 'formatted_address',
          hours: 'opening_hours',
          status: 'business_status',
        }
        setR((cur) => (cur ? ({ ...cur, [column[fact] ?? fact]: val } as Restaurant) : cur))
        setSuggestions((cur) => cur.filter((s) => s.field !== fact))
      } else {
        await contributeFact(supabase, id, fact, val, 'in_person')
        await reload()
      }
      haptic('success')
      track('owner_fact', { fact })
      toast.success(`${LABEL[fact] ?? 'Detail'} updated for everyone`)
      setEditing(null)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }
  async function keep(s: Suggestion) {
    try {
      if (!demo) {
        if (s.field === 'dish_price') await keepDishPrice(supabase, s.dish_id!)
        else await keepOwnerValue(supabase, id, s.field)
      }
      setSuggestions((cur) =>
        cur.filter((x) =>
          s.field === 'dish_price' ? x.dish_id !== s.dish_id : x.field !== s.field,
        ),
      )
      toast.success('Kept yours')
    } catch (error: any) {
      toast.error(error?.message || 'Could not do that')
    }
  }
  async function use(s: Suggestion) {
    if (s.field !== 'dish_price') return setFact(s.field, s.value)
    try {
      const dish = menu.find((d) => d.id === s.dish_id)
      if (demo) {
        setMenu((cur) =>
          cur.map((d) => (d.id === s.dish_id ? { ...d, price: Number(s.value) } : d)),
        )
      } else {
        await ownerEditDish(supabase, s.dish_id!, {
          name: dish?.name ?? s.dish,
          price: Number(s.value),
          course: dish?.course ?? null,
        })
        await reload()
      }
      setSuggestions((cur) => cur.filter((x) => x.dish_id !== s.dish_id))
      haptic('success')
      toast.success(`${s.dish} is now $${s.value}`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }

  if (!r) return <div className="skeleton h-40" />
  const utc = (r.opening_hours as Hours | null)?.utc ?? localUtcOffset()
  return (
    // O12 (Round 95): two columns on a computer (.owner-wide in polish.css)
    <div className="owner-wide stagger flex flex-col gap-4">
      <div className="surface flex flex-col gap-1">
        <VerifiedBadge />
        <p className="text-sm text-muted-foreground">
          Saved by {r.places_count} group{r.places_count === 1 ? '' : 's'} on Crumbs
          {insights?.visits
            ? ` · ${insights.visits} visit${insights.visits === 1 ? '' : 's'} logged`
            : ''}
          {insights?.per_head ? ` · about $${insights.per_head} a person` : ''}
          {insights?.takeout_share !== null && insights?.takeout_share !== undefined
            ? ` · ${insights.takeout_share}% takeout`
            : ''}
        </p>
      </div>

      <OwnerInsights restaurantId={r.id} supabase={supabase} demo={demo} />
      <OwnerTaps tools={tools} />
      <OwnerHeadsUps restaurantId={r.id} supabase={supabase} demo={demo} />
      <OwnerPosts restaurantId={r.id} supabase={supabase} demo={demo} />
      {suggestions.length > 0 && (
        <section className="surface flex flex-col gap-2">
          <h3 className="font-serif text-xl font-bold">Members suggest</h3>
          <p className="text-xs text-muted-foreground">
            What people who saved your restaurant say is different. Use it, or keep yours. If you’re
            away for 30+ days, something 3+ people agree on for 2 weeks updates by itself.
          </p>
          {suggestions.map((s, i) => (
            <div key={i} className="surface-soft flex flex-col gap-1 text-sm">
              {s.field === 'dish_price' ? (
                <p>
                  <strong>{s.dish}:</strong> ${Number(s.value).toFixed(Number(s.value) % 1 ? 2 : 0)}
                  {s.current !== null && s.current !== undefined && (
                    <span className="text-muted-foreground"> (yours: ${Number(s.current)})</span>
                  )}
                </p>
              ) : (
                <p>
                  <strong>{LABEL[s.field] ?? s.field}:</strong> {showValue(s.field, s.value)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {s.people} {s.people === 1 ? 'person' : 'people'}
                {s.photo ? ' · from a photo' : ''}
              </p>
              <div className="flex gap-2">
                <button className="secondary !min-h-9 flex-1 text-sm" onClick={() => keep(s)}>
                  Keep mine
                </button>
                <button className="primary !min-h-9 flex-1 text-sm" onClick={() => use(s)}>
                  Use this
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="surface flex flex-col">
        <h3 className="font-serif text-xl font-bold">Details</h3>
        {FIELDS.map((f) => {
          const text = showValue(f, valueOf(r, f))
          return (
            <div key={f} className="profile-row flex flex-col gap-1 py-2">
              <div className="flex items-start gap-2">
                <span className="w-16 shrink-0 text-sm font-semibold">{LABEL[f]}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {text ?? <span className="text-muted-foreground">Not set</span>}
                </span>
                {editing !== f && (
                  <button
                    className="text-xs font-semibold text-primary underline"
                    onClick={() => setEditing(f)}
                  >
                    {text ? 'Edit' : 'Add'}
                  </button>
                )}
              </div>
              {editing === f && (
                <FactEditor
                  field={f}
                  initial={valueOf(r, f)}
                  utc={utc}
                  hideHow
                  saveLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSave={(val) => setFact(f, val)}
                />
              )}
            </div>
          )
        })}
        <div className="profile-row flex items-start gap-2 py-2">
          <span className="w-16 shrink-0 text-sm font-semibold">Price</span>
          <span className="min-w-0 flex-1 text-sm">
            {r.price_level ? '$'.repeat(r.price_level) : 'Not set'}
            <span className="block text-xs text-muted-foreground">
              Set from your menu prices (add prices below).
            </span>
          </span>
        </div>
      </section>
      <OwnerNames restaurant={r} supabase={supabase} demo={demo} onSaved={reload} />
      <OwnerTags
        key={(r.owner_tags ?? []).join('|')}
        restaurant={r}
        supabase={supabase}
        demo={demo}
        onSaved={reload}
      />

      <OwnerSpecialHours
        restaurantId={r.id}
        hours={r.opening_hours as Hours | null}
        utc={utc}
        supabase={supabase}
        demo={demo}
        onChanged={reload}
      />
      <OwnerMenu
        restaurantId={id}
        menu={menu}
        sections={sections}
        supabase={supabase}
        demo={demo}
        onMenu={setMenu}
        onSections={setSections}
        onChanged={reload}
      />
      <OwnerPriceChange
        restaurantId={id}
        menu={menu}
        supabase={supabase}
        demo={demo}
        onMenu={setMenu}
        onChanged={reload}
      />
      <OwnerPastePrices restaurantId={id} menu={menu} supabase={supabase} demo={demo} onChanged={reload} />
      <OwnerMenuPdf restaurantId={r.id} supabase={supabase} demo={demo} />
      <OwnerTableQr name={r.name} tools={tools} restaurant={r} menu={menu} sections={sections} supabase={supabase} demo={demo} onSaved={reload} />
      <OwnerSiteBadge name={r.name} tools={tools} />
      <OwnerBooking restaurantId={r.id} supabase={supabase} demo={demo} />
      <OwnerPoster restaurantId={r.id} name={r.name} />
      <OwnerBigChange restaurant={r} supabase={supabase} demo={demo} onSaved={reload} />
      <OwnerTeam restaurantId={r.id} name={r.name} supabase={supabase} demo={demo} onLeft={() => window.location.reload()} />
    </div>
  )
}

/** O10 (Round 82): the restaurant's name in its own language and other names people search for. */
function OwnerNames({
  restaurant,
  supabase,
  demo,
  onSaved,
}: {
  restaurant: Restaurant
  supabase: any
  demo: boolean
  onSaved: () => void
}) {
  const [local, setLocal] = useState(restaurant.name_local ?? '')
  const [aka, setAka] = useState((restaurant.aka ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const others = aka
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  const dirty =
    local.trim() !== (restaurant.name_local ?? '') ||
    others.join('|') !== (restaurant.aka ?? []).join('|')
  async function save() {
    if (demo) return toast.success('Names saved')
    setBusy(true)
    const { error } = await supabase.rpc('set_restaurant_names', {
      target: restaurant.id,
      local_name: local.trim() || null,
      other_names: others,
    })
    setBusy(false)
    if (error)
      return toast.error(
        /set_restaurant_names|schema cache|PGRST202/i.test(error.message ?? '')
          ? 'Other names aren’t switched on yet'
          : error.message,
      )
    haptic('success')
    toast.success('Names saved — people can find you by them now')
    onSaved()
  }
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Other names</h3>
      <p className="text-sm text-muted-foreground">
        Your name in its own language shows under the name on your page. Both, and any other names
        people know you by, work in Crumbs search.
      </p>
      <label className="text-sm font-semibold" htmlFor="owner-name-local">
        Name in its own language
      </label>
      <input
        id="owner-name-local"
        className="field"
        maxLength={160}
        placeholder="e.g. 蘭州拉麵"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
      />
      <label className="text-sm font-semibold" htmlFor="owner-aka">
        Also known as (commas between names, up to 8)
      </label>
      <input
        id="owner-aka"
        className="field"
        maxLength={700}
        placeholder="e.g. Lanzhou Noodle, The noodle place"
        value={aka}
        onChange={(event) => setAka(event.target.value)}
      />
      <button className="primary" disabled={!dirty || busy || others.length > 8} onClick={save}>
        {busy ? 'Saving…' : others.length > 8 ? 'Up to 8 other names' : 'Save names'}
      </button>
    </section>
  )
}

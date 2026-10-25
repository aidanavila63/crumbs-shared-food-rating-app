'use client'
// "Your restaurants": the area for verified owners (#100). Each page they run: what members
// suggest (grouped, never who), every detail, and the menu — add, fix prices, remove dishes.
// Price level isn't set by hand: it follows the menu's prices.
import { useEffect, useState } from 'react'
import { ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  contributeFact,
  keepDishPrice,
  keepOwnerValue,
  loadInsights,
  loadMenu,
  loadRestaurant,
  myRestaurants,
  ownerEditDish,
  ownerSuggestions,
  shareDishes,
  sortMenu,
  dishKey,
  type FactField,
  type Insights,
  type MenuDish,
  type OwnedRestaurant,
  type Restaurant,
  type Suggestion,
} from '@/lib/restaurants'
import { hoursToText, localUtcOffset } from '@/lib/hours-text'
import { menuDishes } from '@/lib/ocr-parse'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { Overlay } from './overlay'
import { ReadPhotoButton } from './photo-reader'
import { FactEditor, STATUS, VerifiedBadge } from './restaurant-profile'
import { OwnerInsights, OwnerPosts, OwnerPoster } from './owner-extras'
import { OwnerMenuPdf } from './menu-pdf'

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
const COURSES: { id: MenuDish['course']; label: string }[] = [
  { id: 'starter', label: 'Starter' },
  { id: 'main', label: 'Main' },
  { id: 'side', label: 'Side' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'drink', label: 'Drink' },
]

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
  })) as MenuDish[]

/** The list of pages you run; tap one to manage it. */
export function OwnerPanel({ supabase, demo }: { supabase: any; demo: boolean }) {
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

  async function reload() {
    if (demo) return
    const [fresh, m, s] = await Promise.all([
      loadRestaurant(supabase, id),
      loadMenu(supabase, id),
      ownerSuggestions(supabase, id).catch(() => []),
    ])
    setR(fresh)
    setMenu(m.menu)
    setSuggestions(s)
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
    <div className="stagger flex flex-col gap-4">
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

      <OwnerMenu
        restaurantId={id}
        menu={menu}
        supabase={supabase}
        demo={demo}
        onMenu={setMenu}
        onChanged={reload}
      />
      <OwnerMenuPdf restaurantId={r.id} supabase={supabase} demo={demo} />
      <OwnerPoster restaurantId={r.id} name={r.name} />
    </div>
  )
}

function OwnerMenu({
  restaurantId,
  menu,
  supabase,
  demo,
  onMenu,
  onChanged,
}: {
  restaurantId: string
  menu: MenuDish[]
  supabase: any
  demo: boolean
  onMenu: (menu: MenuDish[]) => void
  onChanged: () => Promise<void>
}) {
  const [edit, setEdit] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', price: '', course: null as MenuDish['course'] })
  const [adding, setAdding] = useState({ name: '', price: '' })

  const price = (text: string) => {
    const n = Number(text.replace(/[^0-9.]/g, ''))
    return text.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
  }
  async function save(dish: MenuDish, change: Parameters<typeof ownerEditDish>[2]) {
    try {
      if (demo) {
        onMenu(
          change === 'remove'
            ? menu.filter((d) => d.id !== dish.id)
            : sortMenu(
                menu.map((d) =>
                  d.id === dish.id
                    ? {
                        ...d,
                        name: change.name ?? d.name,
                        price: change.price ?? null,
                        course: change.course ?? null,
                        owner_ok: true,
                        hidden: false,
                      }
                    : d,
                ),
              ),
        )
      } else {
        await ownerEditDish(supabase, dish.id, change)
        await onChanged()
      }
      haptic('success')
      toast.success(change === 'remove' ? `Removed ${dish.name}` : 'Saved')
      setEdit(null)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }
  async function add(dishes: { name: string; price?: number | null }[], how: 'photo' | 'manual') {
    if (!dishes.length) return
    try {
      if (demo) {
        onMenu(
          sortMenu([
            ...menu,
            ...dishes.map((d, i) => ({
              id: `demo-owned-new-${Date.now()}-${i}`,
              restaurant_id: restaurantId,
              name: d.name,
              name_key: dishKey(d.name),
              price: d.price ?? null,
              description: null,
              course: null,
              dietary: [],
              source: how,
              owner_ok: true,
              confirms: 0,
              flags: 0,
              price_checked_at: new Date().toISOString(),
            })),
          ]),
        )
      } else {
        await shareDishes(supabase, restaurantId, dishes, how)
        await onChanged()
      }
      haptic('success')
      toast.success(`Added ${dishes.length} dish${dishes.length === 1 ? '' : 'es'}`)
      setAdding({ name: '', price: '' })
    } catch (error: any) {
      toast.error(error?.message || 'Could not add that')
    }
  }

  return (
    <section className="surface flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl font-bold">Menu</h3>
        <span className="text-xs text-muted-foreground">{menu.length} dishes</span>
      </div>
      <ReadPhotoButton
        label="Snap your menu"
        className="primary !min-h-10 text-sm"
        onText={(text) => {
          const found = menuDishes(text)
          if (!found.length) return toast('Couldn’t read dishes there — try a closer photo')
          add(found, 'photo')
        }}
      />
      {menu.map((dish) =>
        edit === dish.id ? (
          <div
            key={dish.id}
            className="rise-panel flex flex-col gap-2 rounded-2xl bg-[var(--card)] p-3"
          >
            <input
              className="field !min-h-10 text-sm"
              aria-label="Dish name"
              maxLength={120}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <input
              className="field !min-h-10 text-sm"
              aria-label="Price"
              inputMode="decimal"
              placeholder="Price"
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
            />
            <div className="chip-row">
              {COURSES.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={draft.course === c.id}
                  className={`chip chip-sm ${draft.course === c.id ? 'chip-active' : ''}`}
                  onClick={() =>
                    setDraft({ ...draft, course: draft.course === c.id ? null : c.id })
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="secondary !min-h-10 text-sm" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button
                className="primary !min-h-10 flex-1 text-sm"
                disabled={!draft.name.trim()}
                onClick={() =>
                  save(dish, {
                    name: draft.name.trim(),
                    price: price(draft.price),
                    course: draft.course,
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div key={dish.id} className="menu-row flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-5">
                {dish.name}
                {dish.price !== null && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    ${Number(dish.price).toFixed(Number(dish.price) % 1 ? 2 : 0)}
                  </span>
                )}
              </p>
              {dish.hidden ? (
                <p className="text-xs font-semibold text-primary">
                  Members say this isn’t on the menu any more — fix it or remove it
                </p>
              ) : !dish.owner_ok ? (
                <p className="text-xs text-muted-foreground">Added by members</p>
              ) : null}
            </div>
            <button
              className="icon-btn !h-9 !w-9"
              aria-label={`Edit ${dish.name}`}
              onClick={() => {
                setDraft({
                  name: dish.name,
                  price: dish.price === null ? '' : String(dish.price),
                  course: dish.course,
                })
                setEdit(dish.id)
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-btn !h-9 !w-9"
              aria-label={`Remove ${dish.name}`}
              onClick={() => save(dish, 'remove')}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
      )}
      <form
        className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!adding.name.trim()) return
          add([{ name: adding.name.trim(), price: price(adding.price) }], 'manual')
        }}
      >
        <input
          className="field !min-h-10 text-sm"
          aria-label="New dish"
          placeholder="Add a dish"
          maxLength={120}
          value={adding.name}
          onChange={(event) => setAdding({ ...adding, name: event.target.value })}
        />
        <input
          className="field !min-h-10 text-sm"
          aria-label="New dish price"
          inputMode="decimal"
          placeholder="$"
          value={adding.price}
          onChange={(event) => setAdding({ ...adding, price: event.target.value })}
        />
        <button className="secondary !min-h-10 shrink-0 text-sm" disabled={!adding.name.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}

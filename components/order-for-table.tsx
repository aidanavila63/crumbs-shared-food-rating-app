'use client'
// #119 Order for the table — the group's shareables at a place. Pick dishes (and how many of
// each), say how many people each one is good to share between, see the total before tax and
// tip split across everyone, and keep it: the order saves for the group when you close (✕).
// "Fill with favourites" starts one from your best-rated, order-again and shareable dishes.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Minus, Plus, Share2, Sparkles, Users } from 'lucide-react'
import type { Dish, Profile } from '@/hooks/use-crumbs-data'
import { dishWarnings } from '@/lib/place-info'
import { orderText, orderTotals, suggestedItems, type OrderItem } from '@/lib/dish-helpers'
import { dishAverage } from '@/lib/stats'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

type Saved = { people: number; items: OrderItem[] }
// Demo: remembered while the page is open.
const demoOrders = new Map<string, Saved>()

export function OrderForTable({
  placeId,
  placeName,
  dishes,
  members,
  supabase,
  demo,
  onDishMeta,
  onAddDish,
  onClose,
}: {
  placeId: string
  placeName: string
  dishes: Dish[]
  members: Profile[]
  supabase: any
  demo: boolean
  onDishMeta: (dishId: string, changes: Partial<Pick<Dish, 'price' | 'shares'>>) => void
  onAddDish: (name: string, price: number | null, shares: number | null) => Promise<Dish | null>
  onClose: () => void
}) {
  const [people, setPeople] = useState(Math.max(2, members.length || 2))
  const [items, setItems] = useState<OrderItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const saved = useRef<string>('')
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newShares, setNewShares] = useState(2)

  useEffect(() => {
    let cancelled = false
    const apply = (row: Saved | null) => {
      if (cancelled) return
      if (row) {
        setPeople(row.people)
        setItems(row.items)
      }
      saved.current = JSON.stringify(row ?? { people: Math.max(2, members.length || 2), items: [] })
      setLoaded(true)
    }
    if (demo) Promise.resolve().then(() => apply(demoOrders.get(placeId) ?? null))
    else
      supabase
        .from('table_orders')
        .select('people,items')
        .eq('place_id', placeId)
        .maybeSingle()
        .then(({ data }: any) => apply(data ?? null))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, demo])

  const avoids = (d: Dish) => dishWarnings(d, members).length > 0
  const totals = useMemo(() => orderTotals(items, dishes, people), [items, dishes, people])
  const inOrder = items
    .map((item) => ({ item, dish: dishes.find((d) => d.id === item.dish_id) }))
    .filter((x): x is { item: OrderItem; dish: Dish } => !!x.dish)
  const rest = dishes
    .filter((d) => !items.some((i) => i.dish_id === d.id) && d.verdict !== 'never')
    .sort((a, b) => (dishAverage(b) ?? -1) - (dishAverage(a) ?? -1))

  const setQty = (dishId: string, qty: number) =>
    setItems((all) =>
      qty <= 0
        ? all.filter((i) => i.dish_id !== dishId)
        : all.some((i) => i.dish_id === dishId)
          ? all.map((i) => (i.dish_id === dishId ? { ...i, qty: Math.min(20, qty) } : i))
          : [...all, { dish_id: dishId, qty: 1 }],
    )

  /** Saves for the group when closing (only if something changed). */
  async function closeAndSave() {
    const next = JSON.stringify({ people, items })
    if (loaded && next !== saved.current) {
      if (demo) demoOrders.set(placeId, { people, items })
      else {
        const { error } = await supabase
          .from('table_orders')
          .upsert({ place_id: placeId, people, items, updated_at: new Date().toISOString() })
        if (error) toast.error(error.message)
        else toast.success('Order saved for your group')
      }
      if (demo) toast.success('Order saved for your group')
    }
    onClose()
  }

  async function share() {
    const text = orderText(placeName, people, items, dishes)
    haptic('success')
    try {
      if (navigator.share) return await navigator.share({ text })
    } catch {
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied — paste it in your chat')
    } catch {
      toast.error('Could not share from this browser')
    }
  }

  async function addNew() {
    const name = newName.trim()
    if (!name) return
    const price = newPrice.trim() ? Number(newPrice.replace(/[^0-9.]/g, '')) : null
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 10000))
      return toast.error('That price looks off')
    const dish = await onAddDish(name, price, newShares > 1 ? newShares : null)
    if (!dish) return
    setItems((all) => [...all, { dish_id: dish.id, qty: 1 }])
    setNewName('')
    setNewPrice('')
    setNewShares(2)
  }

  return (
    <Overlay label="Order for the table" title="Order for the table" onClose={closeAndSave}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">How many people?</span>
          <Stepper
            value={people}
            min={1}
            max={30}
            label="people"
            onChange={(n) => setPeople(n)}
            big
          />
        </div>

        {inOrder.length > 0 ? (
          <div className="flex flex-col gap-2">
            {inOrder.map(({ item, dish }) => (
              <div key={dish.id} className="surface-soft flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 font-semibold">{dish.name}</span>
                  <Stepper
                    value={item.qty}
                    min={0}
                    max={20}
                    label={dish.name}
                    onChange={(n) => setQty(dish.id, n)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PriceField dish={dish} onSave={(price) => onDishMeta(dish.id, { price })} />
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users size={14} /> shares
                    <Stepper
                      value={dish.shares ?? 1}
                      min={1}
                      max={12}
                      label={`${dish.name} shares between`}
                      onChange={(n) => onDishMeta(dish.id, { shares: n > 1 ? n : null })}
                      small
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing in your order yet. Add dishes below, or let Crumbs start one from your
            favourites.
          </p>
        )}

        {inOrder.length > 0 && (
          <div className="order-total">
            <p>
              About <strong>${totals.total.toFixed(0)}</strong> before tax and tip · ~$
              {totals.each.toFixed(0)} each
            </p>
            <p className="text-xs text-muted-foreground">
              Feeds about {totals.feeds} {totals.feeds === 1 ? 'person' : 'people'}
              {totals.feeds < people ? ` — ${people - totals.feeds} short` : ''}
              {totals.unpriced ? ` · ${totals.unpriced} without a price` : ''}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="secondary flex flex-1 items-center justify-center gap-2"
            onClick={() => {
              haptic('select')
              setItems(suggestedItems(dishes, people, avoids))
            }}
          >
            <Sparkles size={16} /> {items.length ? 'Start over' : 'Fill with favourites'}
          </button>
          {inOrder.length > 0 && (
            <button
              className="primary flex flex-1 items-center justify-center gap-2"
              onClick={share}
            >
              <Share2 size={16} /> Share
            </button>
          )}
        </div>

        {rest.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground">Add from your dishes</p>
            {rest.map((dish) => (
              <button
                key={dish.id}
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm active:bg-[var(--muted)]"
                onClick={() => setQty(dish.id, 1)}
              >
                <span className="min-w-0">
                  <span className="font-semibold">{dish.name}</span>
                  <span className="text-muted-foreground">
                    {dish.price != null ? ` · $${Number(dish.price).toFixed(0)}` : ''}
                    {dish.shares && dish.shares > 1 ? ` · shares ${dish.shares}` : ''}
                    {avoids(dish) ? ' · ⚠ someone avoids' : ''}
                  </span>
                </span>
                <Plus size={16} className="shrink-0 text-primary" />
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground">Something else on the menu</p>
          <input
            className="field"
            placeholder="Dish name (e.g. Nachos platter)"
            maxLength={120}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <input
              className="field"
              style={{ width: 104 }}
              inputMode="decimal"
              placeholder="$ price"
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
            />
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users size={14} /> shares
              <Stepper
                value={newShares}
                min={1}
                max={12}
                label="shares"
                onChange={setNewShares}
                small
              />
            </span>
            <button className="primary ml-auto !px-4" disabled={!newName.trim()} onClick={addNew}>
              Add
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Saved for your group when you close. Skips “never again” dishes; ⚠ marks anything someone
          avoids.
        </p>
      </div>
    </Overlay>
  )
}

function Stepper({
  value,
  min,
  max,
  label,
  onChange,
  big = false,
  small = false,
}: {
  value: number
  min: number
  max: number
  label: string
  onChange: (n: number) => void
  big?: boolean
  small?: boolean
}) {
  return (
    <span className={`stepper ${small ? 'stepper-sm' : ''}`}>
      <button aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={small ? 12 : 14} />
      </button>
      <span className={big ? 'font-serif text-2xl' : 'font-semibold'}>{value}</span>
      <button aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={small ? 12 : 14} />
      </button>
    </span>
  )
}

function PriceField({ dish, onSave }: { dish: Dish; onSave: (price: number | null) => void }) {
  const [text, setText] = useState(dish.price != null ? String(Number(dish.price)) : '')
  return (
    <label className="flex items-center gap-1 text-muted-foreground">
      $
      <input
        className="field !min-h-8 !px-2 !py-0 text-sm"
        style={{ width: 84 }}
        inputMode="decimal"
        placeholder="price"
        aria-label={`${dish.name} price`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const n = text.trim() ? Number(text.replace(/[^0-9.]/g, '')) : null
          if (n !== null && (!Number.isFinite(n) || n > 10000))
            return toast.error('That price looks off')
          if (n !== (dish.price != null ? Number(dish.price) : null)) onSave(n)
        }}
      />
    </label>
  )
}

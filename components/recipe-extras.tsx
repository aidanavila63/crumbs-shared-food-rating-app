'use client'
// U9 (Round 88): servings and scaling, cook mode (screen stays on), shopping list.
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Ingredient } from '@/hooks/use-crumbs-data'
import { ingredientText } from '@/lib/meals'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

export function ServingsStepper({
  value,
  base,
  onChange,
}: {
  value: number
  base: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-2 text-sm" aria-label="Servings">
      <span className="font-semibold">Serves</span>
      <button
        className="icon-btn"
        aria-label="Fewer servings"
        disabled={value <= 1}
        onClick={() => {
          haptic('select')
          onChange(value - 1)
        }}
      >
        <Minus size={16} />
      </button>
      <span className="min-w-6 text-center font-serif text-xl font-bold" aria-live="polite">
        {value}
      </span>
      <button
        className="icon-btn"
        aria-label="More servings"
        disabled={value >= 50}
        onClick={() => {
          haptic('select')
          onChange(value + 1)
        }}
      >
        <Plus size={16} />
      </button>
      {value !== base && (
        <button
          className="text-xs font-semibold text-primary underline"
          onClick={() => onChange(base)}
        >
          Back to {base}
        </button>
      )}
    </div>
  )
}

export const timeText = (prep?: number | null, cook?: number | null) =>
  [prep ? `Prep ${minutes(prep)}` : null, cook ? `Cook ${minutes(cook)}` : null]
    .filter(Boolean)
    .join(' · ')
const minutes = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`

/** Big steps, one at a time, and the screen stays on while it's open (where the phone allows it). */
export function CookMode({
  name,
  steps,
  ingredients,
  onClose,
}: {
  name: string
  steps: string[]
  ingredients: Ingredient[]
  onClose: () => void
}) {
  const [at, setAt] = useState(-1) // -1 = ingredients first
  const [awake, setAwake] = useState(false)
  useEffect(() => {
    let lock: any = null
    let gone = false
    const ask = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen')
        if (!gone) setAwake(!!lock)
      } catch {
        if (!gone) setAwake(false)
      }
    }
    ask()
    // Phones drop the lock when the app goes to the background; ask again on return.
    const again = () => document.visibilityState === 'visible' && ask()
    document.addEventListener('visibilitychange', again)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', again)
      lock?.release?.().catch(() => {})
    }
  }, [])
  const last = steps.length - 1
  return (
    <Overlay label="Cook mode" title={name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          {awake
            ? 'Your screen will stay on while this is open.'
            : 'Tip: your screen may still turn off on this phone.'}
        </p>
        {at === -1 ? (
          <div className="surface flex flex-col gap-2">
            <h3 className="card-heading">You’ll need</h3>
            <ul className="recipe-ingredients text-lg">
              {ingredients.map((i, n) => (
                <li key={n}>{ingredientText(i)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="surface cook-step" aria-live="polite">
            <p className="text-sm font-semibold text-primary">
              Step {at + 1} of {steps.length}
            </p>
            <p className="mt-2 text-2xl leading-snug">{steps[at]}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button className="secondary flex-1" disabled={at === -1} onClick={() => setAt(at - 1)}>
            <ChevronLeft size={18} /> Back
          </button>
          {at < last ? (
            <button
              className="primary flex-1"
              onClick={() => {
                haptic('tap')
                setAt(at + 1)
              }}
            >
              {at === -1 ? 'Start' : 'Next'} <ChevronRight size={18} />
            </button>
          ) : (
            <button className="primary flex-1" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </Overlay>
  )
}

export async function addToShoppingList(
  supabase: any,
  demo: boolean,
  mealId: string,
  ingredients: Ingredient[],
) {
  const rows = ingredients
    .filter((i) => i.item.trim())
    .map((i) => ({
      item: i.item.trim().slice(0, 160),
      qty: i.qty.trim() || null,
      unit: i.unit || null,
      meal_id: mealId,
    }))
  if (!rows.length) return toast('No ingredients to add')
  if (demo) return toast.success(`Added ${rows.length} to your shopping list`)
  const { error } = await supabase.from('shopping_items').insert(rows)
  if (error)
    return toast.error(
      /shopping_items|schema cache|PGRST205/i.test(error.message ?? '')
        ? 'The shopping list isn’t switched on yet'
        : error.message,
    )
  haptic('success')
  toast.success(`Added ${rows.length} to your shopping list`)
}

type Item = { id: string; item: string; qty: string | null; unit: string | null; done: boolean }

/** Your shopping list (only yours): tick things off, clear the ticked ones, copy it as text. */
export function ShoppingList({
  supabase,
  demo,
  onClose,
}: {
  supabase: any
  demo: boolean
  onClose: () => void
}) {
  const [items, setItems] = useState<Item[] | null>(
    demo
      ? [
          { id: 'd1', item: 'rice noodles', qty: '200', unit: 'g', done: false },
          { id: 'd2', item: 'limes', qty: '2', unit: null, done: true },
        ]
      : null,
  )
  useEffect(() => {
    if (demo) return
    supabase
      .from('shopping_items')
      .select('id,item,qty,unit,done')
      .order('done')
      .order('created_at')
      .then(({ data, error }: any) => setItems(error ? [] : (data ?? [])))
  }, [demo, supabase])
  async function toggle(it: Item) {
    setItems((all) => all?.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) ?? null)
    if (!demo) await supabase.from('shopping_items').update({ done: !it.done }).eq('id', it.id)
  }
  async function clearDone() {
    const ids = (items ?? []).filter((x) => x.done).map((x) => x.id)
    setItems((all) => all?.filter((x) => !x.done) ?? null)
    if (!demo && ids.length) await supabase.from('shopping_items').delete().in('id', ids)
  }
  async function copy() {
    const text = (items ?? [])
      .filter((x) => !x.done)
      .map((x) => `• ${ingredientText({ qty: x.qty ?? '', unit: x.unit ?? '', item: x.item })}`)
      .join('\n')
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast.success('Copied')
      }
    } catch {}
  }
  const left = (items ?? []).filter((x) => !x.done).length
  return (
    <Overlay label="Shopping list" title="Shopping list" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {items === null && <div className="skeleton h-20" />}
        {items?.length === 0 && (
          <p className="empty text-sm text-muted-foreground">
            Empty. Open a recipe and tap <ShoppingCart size={14} className="inline" /> Add to
            shopping list.
          </p>
        )}
        {!!items?.length && (
          <div className="surface flex flex-col">
            {items.map((x) => (
              <label key={x.id} className={`shop-row ${x.done ? 'shop-done' : ''}`}>
                <input type="checkbox" checked={x.done} onChange={() => toggle(x)} />
                <span>
                  {ingredientText({ qty: x.qty ?? '', unit: x.unit ?? '', item: x.item })}
                </span>
              </label>
            ))}
          </div>
        )}
        {!!items?.length && (
          <div className="flex gap-2">
            <button className="secondary flex-1" disabled={!left} onClick={copy}>
              Share list
            </button>
            <button
              className="secondary flex-1"
              disabled={left === items.length}
              onClick={clearDone}
            >
              <Trash2 size={16} /> Clear ticked
            </button>
          </div>
        )}
      </div>
    </Overlay>
  )
}

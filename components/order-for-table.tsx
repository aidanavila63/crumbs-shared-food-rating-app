'use client'
// #119 Order for the table: your group's must-tries and favourites here, sized for how many are
// eating, with a price estimate — and a Share button to send it to whoever's coming.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Minus, Plus, Share2 } from 'lucide-react'
import type { Dish, Profile } from '@/hooks/use-crumbs-data'
import { dishWarnings } from '@/lib/place-info'
import { orderForTable, tableText } from '@/lib/dish-helpers'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

export function OrderForTable({
  placeName,
  dishes,
  members,
  onClose,
}: {
  placeName: string
  dishes: Dish[]
  members: Profile[]
  onClose: () => void
}) {
  const [people, setPeople] = useState(Math.max(2, members.length || 2))
  const order = useMemo(
    () => orderForTable(dishes, people, (d) => dishWarnings(d, members).length > 0),
    [dishes, people, members],
  )

  async function share() {
    const text = tableText(placeName, people, order)
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

  return (
    <Overlay label="Order for the table" title="Order for the table" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">How many people?</span>
          <span className="flex items-center gap-3">
            <button
              className="icon-btn"
              aria-label="Fewer people"
              onClick={() => setPeople((n) => Math.max(1, n - 1))}
            >
              <Minus size={16} />
            </button>
            <span className="w-6 text-center font-serif text-2xl">{people}</span>
            <button
              className="icon-btn"
              aria-label="More people"
              onClick={() => setPeople((n) => Math.min(20, n + 1))}
            >
              <Plus size={16} />
            </button>
          </span>
        </div>
        {order.picks.length ? (
          <div className="flex flex-col gap-2">
            {order.picks.map(({ dish, why }) => (
              <div key={dish.id} className="surface-soft flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{dish.name}</span>
                  <span className="block text-xs text-muted-foreground">{why}</span>
                </span>
                {dish.price != null && (
                  <span className="shrink-0 text-sm">${Number(dish.price).toFixed(0)}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Rate a few dishes here first and Crumbs will pick for the table.
          </p>
        )}
        {order.total !== null && (
          <p className="text-sm">
            About <strong>${order.total}</strong> before tax and tip · ~${order.perHead} each
            {order.missingPrices ? ` · ${order.missingPrices} without a price` : ''}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Skips anything marked “never again” or that someone in your group avoids.
        </p>
        {order.picks.length > 0 && (
          <button className="primary flex items-center justify-center gap-2" onClick={share}>
            <Share2 size={16} /> Share the order
          </button>
        )}
      </div>
    </Overlay>
  )
}

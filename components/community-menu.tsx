'use client'
// The restaurant's shared menu (#19 + #27): built from menu photos and website imports by every
// group that saves this restaurant. ✓ / ✕ keep it honest; "+" copies a dish into your own list to rate.
import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { Dish } from '@/hooks/use-crumbs-data'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import { missingFromOurs, priceAge, priceIsOld, type MenuDish } from '@/lib/restaurants'
import { haptic } from '@/lib/motion'

const COURSE: Record<string, string> = {
  starter: 'Starters',
  main: 'Mains',
  side: 'Sides',
  dessert: 'Desserts',
  drink: 'Drinks',
}

export function CommunityMenu({
  store,
  ours,
  placeName,
  onAddToOurs,
}: {
  store: RestaurantStore
  ours: Dish[]
  placeName: string
  onAddToOurs: (dishes: MenuDish[]) => void
}) {
  const [all, setAll] = useState(false)
  if (!store.enabled || !store.restaurant) return null
  const missing = missingFromOurs(store.menu, ours)
  const missingIds = new Set(missing.map((d) => d.id))
  const shown = all ? store.menu : store.menu.slice(0, 8)
  const others = Math.max(0, (store.restaurant.places_count ?? 1) - 1)
  return (
    <div className="surface-soft community-menu flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl font-bold">Menu</h3>
        <span className="text-xs text-muted-foreground">
          {store.menu.length ? `${store.menu.length} dishes · ` : ''}
          shared on Crumbs{others ? ` · ${others} other group${others === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      {store.loading && !store.menu.length && <div className="skeleton h-16" />}
      {!store.loading && !store.menu.length && (
        <p className="text-sm text-muted-foreground">
          No menu yet. Take a <strong>Menu photo</strong> — the dishes you confirm build {placeName}
          ’s menu for everyone who saves it (just the menu, never your ratings).
        </p>
      )}
      {shown.map((dish, i) => {
        const heading = i === 0 || shown[i - 1].course !== dish.course ? dish.course : undefined
        const vote = store.mine[dish.id]
        const old = priceIsOld(dish.price_checked_at)
        return (
          <div key={dish.id} className="flex flex-col">
            {heading && (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {COURSE[heading]}
              </p>
            )}
            <div className="menu-row flex items-start gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-5">
                  {dish.name}
                  {dish.price !== null && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      ${Number(dish.price).toFixed(Number(dish.price) % 1 ? 2 : 0)}
                    </span>
                  )}
                </p>
                {dish.description && (
                  <p className="text-xs text-muted-foreground">{dish.description}</p>
                )}
                {old && dish.price !== null && (
                  <p className="text-xs text-muted-foreground">
                    Price from {priceAge(dish.price_checked_at)}
                  </p>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  className={`menu-vote ${vote === 'confirm' ? 'menu-vote-yes' : ''}`}
                  aria-label={`${dish.name} is on the menu`}
                  aria-pressed={vote === 'confirm'}
                  onClick={() => {
                    haptic('select')
                    store.vote(dish, vote === 'confirm' ? null : 'confirm')
                  }}
                >
                  <Check size={14} />
                  {dish.confirms > 0 && <span>{dish.confirms}</span>}
                </button>
                <button
                  className={`menu-vote ${vote === 'flag' ? 'menu-vote-no' : ''}`}
                  aria-label={`${dish.name} isn't on the menu any more`}
                  aria-pressed={vote === 'flag'}
                  onClick={() => {
                    haptic('select')
                    store.vote(dish, vote === 'flag' ? null : 'flag')
                  }}
                >
                  <X size={14} />
                </button>
                {missingIds.has(dish.id) && (
                  <button
                    className="menu-vote menu-add"
                    aria-label={`Add ${dish.name} to our dishes`}
                    onClick={() => onAddToOurs([dish])}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </span>
            </div>
          </div>
        )
      })}
      {store.menu.length > 8 && (
        <button
          className="text-sm font-semibold text-primary underline"
          onClick={() => setAll(!all)}
        >
          {all ? 'Show less' : `Show all ${store.menu.length}`}
        </button>
      )}
      {missing.length > 1 && (
        <button className="secondary !min-h-10 text-sm" onClick={() => onAddToOurs(missing)}>
          <Plus size={16} /> Add all {missing.length} to our dishes to rate
        </button>
      )}
    </div>
  )
}

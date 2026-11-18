'use client'
// D3 (Round 83, #309): one Filter pill opens this sheet — what to show, the order, and the area.
// The filters you've picked show as small chips beside the pill; tap a chip's × to clear it.
import { SlidersHorizontal, X } from 'lucide-react'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

export type AreaOption = { key: string; name: string; shared?: boolean }
export type { OpenAt } from '@/lib/open-at'
import type { OpenAt } from '@/lib/open-at'

export function FilterPill({
  active,
  onOpen,
  chips,
}: {
  active: number
  onOpen: () => void
  chips: { key: string; label: string; onClear: () => void }[]
}) {
  return (
    <div className="filter-row">
      <button
        type="button"
        className={`pick-pill ${active ? 'pick-pill-on' : ''}`}
        onClick={() => {
          haptic('tap')
          onOpen()
        }}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        Filter{active ? ` · ${active}` : ''}
      </button>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="filter-chip"
          aria-label={`Clear ${chip.label}`}
          onClick={() => {
            haptic('select')
            chip.onClear()
          }}
        >
          {chip.label}
          <X size={13} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

export function FilterSheet<S extends string, O extends string>({
  statuses,
  status,
  counts,
  onStatus,
  sorts,
  sort,
  onSort,
  areas,
  area,
  onArea,
  groupName,
  onClose,
  onReset,
  factOptions = [],
  facts = [],
  onFacts,
  openAt = null,
  onOpenAt,
}: {
  statuses: readonly S[]
  status: S
  counts: Record<string, number> | null
  onStatus: (s: S) => void
  sorts: readonly O[]
  sort: O
  onSort: (o: O) => void
  areas: AreaOption[]
  area: string | null
  onArea: (key: string | null) => void
  groupName: string
  onClose: () => void
  onReset: () => void
  /** U3: Good to know details confirmed for at least one place here */
  factOptions?: { key: string; label: string }[]
  facts?: string[]
  onFacts?: (keys: string[]) => void
  /** U16 */
  openAt?: OpenAt
  onOpenAt?: (choice: OpenAt) => void
}) {
  const choice = (on: boolean, label: string, pick: () => void, count?: number) => (
    <button
      key={label}
      type="button"
      role="radio"
      aria-checked={on}
      className={`chip ${on ? 'chip-active' : ''}`}
      onClick={() => {
        haptic('select')
        pick()
      }}
    >
      {label}
      {count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  )
  const shared = areas.filter((a) => a.shared)
  const mine = areas.filter((a) => !a.shared)
  return (
    <Overlay
      label="Filter places"
      title="Filter"
      onClose={onClose}
      action={
        <button type="button" className="text-sm font-semibold text-primary" onClick={onReset}>
          Reset
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Show</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Show">
            {statuses.map((s) => choice(status === s, s, () => onStatus(s), counts?.[s]))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Order</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Order">
            {sorts.map((o) => choice(sort === o, o, () => onSort(o)))}
          </div>
        </div>
        {areas.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Area</h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Area">
              {choice(!area, 'Anywhere', () => onArea(null))}
              {shared.map((a) => choice(area === a.key, `Near ${a.name}`, () => onArea(a.key)))}
            </div>
            {shared.length > 0 && mine.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Above: {groupName}’s locations. Below: your own places (only you see them).
              </p>
            )}
            {mine.length > 0 && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your own places">
                {mine.map((a) => choice(area === a.key, `Near ${a.name}`, () => onArea(a.key)))}
              </div>
            )}
          </div>
        )}
        {onOpenAt && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Open</h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Open">
              {choice(!openAt, 'Any time', () => onOpenAt(null))}
              {choice(openAt === 'now', 'Now', () => onOpenAt('now'))}
              {choice(openAt === 'dinner', 'For dinner', () => onOpenAt('dinner'))}
              {choice(openAt === 'late', 'Night out', () => onOpenAt('late'))}
            </div>
            {(openAt === 'dinner' || openAt === 'late') && (
              <p className="text-xs text-muted-foreground">
                {openAt === 'dinner'
                  ? 'Open at some point between 5 and 10 pm.'
                  : 'Open at some point between 11 pm and 2 am.'}
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <span className="shrink-0">Or at</span>
              <input
                type="datetime-local"
                className="field"
                aria-label="Open at a time you pick"
                value={openAt && !['now', 'dinner', 'late'].includes(openAt) ? openAt : ''}
                onChange={(event) => onOpenAt(event.target.value || null)}
              />
            </label>
            {openAt && (
              <p className="text-xs text-muted-foreground">Places without hours on Crumbs are left out.</p>
            )}
          </div>
        )}
        {onFacts && factOptions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Good to know</h3>
            <div className="flex flex-wrap gap-2" aria-label="Good to know">
              {factOptions.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={facts.includes(f.key)}
                  className={`chip ${facts.includes(f.key) ? 'chip-active' : ''}`}
                  onClick={() => {
                    haptic('select')
                    onFacts(facts.includes(f.key) ? facts.filter((k) => k !== f.key) : [...facts, f.key])
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Only details people confirmed (2 agreeing, or the owner). Always check with the restaurant
              about allergies and diets.
            </p>
          </div>
        )}
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Overlay>
  )
}

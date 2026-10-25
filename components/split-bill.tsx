'use client'
// #142 Split the bill: list what was ordered (from the receipt, or typed), tap who had each thing
// (shared things split evenly), add tax and tip, and see who owes what. Just the maths.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Share2, X } from 'lucide-react'
import type { Profile } from '@/hooks/use-crumbs-data'
import { billText, splitBill, type BillItem } from '@/lib/split-bill'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

export function SplitBill({
  placeName,
  items: start = [],
  members,
  userId,
  onClose,
}: {
  placeName: string
  items?: { name: string; price: number | null }[]
  members: Profile[]
  userId?: string
  onClose: () => void
}) {
  const people0 = members.filter((m) => m.role !== 'guest').map((m) => m.id)
  const [people, setPeople] = useState<string[]>(people0.length ? people0 : [userId ?? 'me'])
  const [extra, setExtra] = useState<string[]>([]) // guests at the table who aren't in Crumbs
  const [items, setItems] = useState<BillItem[]>(
    start
      .filter((i) => i.price !== null)
      .map((i) => ({ name: i.name, price: Number(i.price), who: [] })),
  )
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [taxPct, setTaxPct] = useState(13)
  const [tipPct, setTipPct] = useState(18)
  const [paidBy, setPaidBy] = useState<string | null>(userId ?? null)
  const [friend, setFriend] = useState('')
  const everyone = [...people, ...extra]
  const label = (id: string) =>
    id === userId
      ? 'You'
      : (members.find((m) => m.id === id)?.display_name.split(' ')[0] ?? id.replace(/^friend:/, ''))
  const result = useMemo(
    () => splitBill(items, everyone, { taxPct, tipPct }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, people, extra, taxPct, tipPct],
  )

  function addItem() {
    const p = Number(price.replace(/[^0-9.]/g, ''))
    if (!name.trim() || !(p > 0)) return toast('Add a name and a price')
    setItems((all) => [...all, { name: name.trim().slice(0, 60), price: p, who: [] }])
    setName('')
    setPrice('')
  }
  const toggle = (i: number, person: string) =>
    setItems((all) =>
      all.map((item, j) =>
        j === i
          ? {
              ...item,
              who: item.who.includes(person)
                ? item.who.filter((p) => p !== person)
                : [...item.who, person],
            }
          : item,
      ),
    )

  async function share() {
    const text = billText(placeName, result, label, paidBy)
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

  const chip = (on: boolean) => `chip chip-sm ${on ? 'chip-active' : ''}`
  return (
    <Overlay label="Split the bill" title="Split the bill" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Who’s paying their share?</p>
          <div className="chip-row">
            {people0.map((id) => (
              <button
                key={id}
                aria-pressed={people.includes(id)}
                className={chip(people.includes(id))}
                onClick={() =>
                  setPeople((all) =>
                    all.includes(id) ? all.filter((p) => p !== id) : [...all, id],
                  )
                }
              >
                {label(id)}
              </button>
            ))}
            {extra.map((id) => (
              <button
                key={id}
                className={chip(true)}
                aria-label={`Remove ${label(id)}`}
                onClick={() => setExtra((all) => all.filter((p) => p !== id))}
              >
                {label(id)} <X size={12} className="inline" />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="+ Someone else (name)"
              maxLength={20}
              value={friend}
              onChange={(event) => setFriend(event.target.value)}
            />
            <button
              className="secondary !px-3"
              disabled={!friend.trim()}
              onClick={() => {
                setExtra((all) => [...new Set([...all, `friend:${friend.trim()}`])])
                setFriend('')
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">What you ordered</p>
          {items.map((item, i) => (
            <div key={i} className="surface-soft flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">{item.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-sm">
                  ${item.price.toFixed(2)}
                  <button
                    aria-label={`Remove ${item.name}`}
                    onClick={() => setItems((all) => all.filter((_, j) => j !== i))}
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
              <div className="chip-row">
                {everyone.map((id) => (
                  <button
                    key={id}
                    aria-pressed={item.who.includes(id)}
                    className={chip(item.who.includes(id))}
                    onClick={() => toggle(i, id)}
                  >
                    {label(id)}
                  </button>
                ))}
              </div>
              {!item.who.length && (
                <p className="text-xs text-muted-foreground">
                  Nobody picked — split between everyone
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="Item"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <input
              className="field"
              style={{ width: 90 }}
              inputMode="decimal"
              placeholder="$"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addItem()}
            />
            <button className="secondary !px-3" aria-label="Add item" onClick={addItem}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="chip-row" aria-label="Tax">
            <span className="text-sm font-semibold">Tax</span>
            {[0, 5, 13, 15].map((n) => (
              <button key={n} className={chip(taxPct === n)} onClick={() => setTaxPct(n)}>
                {n}%
              </button>
            ))}
          </div>
          <div className="chip-row" aria-label="Tip">
            <span className="text-sm font-semibold">Tip</span>
            {[0, 15, 18, 20, 25].map((n) => (
              <button key={n} className={chip(tipPct === n)} onClick={() => setTipPct(n)}>
                {n}%
              </button>
            ))}
          </div>
        </div>

        <div className="order-total flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Food ${result.subtotal.toFixed(2)} · tax ${result.tax.toFixed(2)} · tip $
            {result.tip.toFixed(2)} · <strong>total ${result.total.toFixed(2)}</strong>
          </p>
          {result.shares.map((s) => (
            <div key={s.person} className="flex items-center justify-between">
              <span className="font-semibold">{label(s.person)}</span>
              <span className="font-serif text-xl text-primary">${s.owes.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          Paid by
          <select
            className="field !w-auto"
            value={paidBy ?? ''}
            onChange={(event) => setPaidBy(event.target.value || null)}
          >
            <option value="">—</option>
            {everyone.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
        <button className="primary flex items-center justify-center gap-2" onClick={share}>
          <Share2 size={16} /> Share who owes what
        </button>
        <p className="text-xs text-muted-foreground">
          Tax and tip are shared in proportion to what each person had. Nothing is saved.
        </p>
      </div>
    </Overlay>
  )
}

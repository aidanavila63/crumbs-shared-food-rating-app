'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Place, PlaceVisit } from '@/hooks/use-crumbs-data'

const today = () => new Date().toISOString().slice(0, 10)
const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`

export function VisitsPanel({
  place,
  userId,
  supabase,
  demo,
  onUpdate,
}: {
  place: Place
  userId?: string
  supabase: any
  demo: boolean
  onUpdate: (place: Place) => void
}) {
  const [date, setDate] = useState(today)
  const [spend, setSpend] = useState('')
  const [busy, setBusy] = useState(false)
  const visits = [...(place.place_visits ?? [])].sort((a, b) =>
    b.visited_on.localeCompare(a.visited_on),
  )
  const total = visits.reduce((sum, visit) => sum + (visit.spend ?? 0), 0)

  async function apply(next: PlaceVisit[]) {
    const latest =
      next
        .map((visit) => visit.visited_on)
        .sort()
        .at(-1) ?? null
    onUpdate({ ...place, place_visits: next, visited_on: latest })
    // Cards still show the latest date, so keep that column in step.
    if (!demo) await supabase.from('places').update({ visited_on: latest }).eq('id', place.id)
  }

  async function add() {
    if (!date) return toast.error('Pick a date')
    const amount = spend.trim() ? Number(spend.replace(/[^0-9.]/g, '')) : null
    if (amount !== null && (Number.isNaN(amount) || amount > 100000))
      return toast.error('That amount looks off')
    setBusy(true)
    try {
      let row: PlaceVisit = {
        id: crypto.randomUUID(),
        place_id: place.id,
        visited_on: date,
        spend: amount,
      }
      if (!demo) {
        const { data, error } = await supabase
          .from('place_visits')
          .insert({ place_id: place.id, visited_on: date, spend: amount, created_by: userId })
          .select('id,place_id,visited_on,spend')
          .single()
        if (error) throw error
        row = data
      }
      await apply([...(place.place_visits ?? []), row])
      setSpend('')
      toast.success('Visit logged')
    } catch (error: any) {
      toast.error(error?.message || 'Could not log that visit')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const before = place.place_visits ?? []
    if (!demo) {
      const { error } = await supabase.from('place_visits').delete().eq('id', id)
      if (error) return toast.error(error.message)
    }
    await apply(before.filter((visit) => visit.id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl font-bold">Visits</h3>
        {visits.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {visits.length} visit{visits.length === 1 ? '' : 's'}
            {total > 0 ? ` · ${money(total)} total` : ''}
          </span>
        )}
      </div>
      {visits.map((visit) => (
        <div className="surface-soft flex items-center justify-between text-sm" key={visit.id}>
          <span>
            {new Date(`${visit.visited_on}T12:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            {visit.spend ? ` · ${money(Number(visit.spend))}` : ''}
          </span>
          <button
            className="text-xs underline"
            onClick={() => remove(visit.id)}
            aria-label="Delete this visit"
          >
            Delete
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          aria-label="Date you visited"
          className="field !w-auto min-w-0 flex-1"
          type="date"
          max={today()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <input
          aria-label="What you spent (optional)"
          className="field !w-24"
          inputMode="decimal"
          placeholder="$ spent"
          value={spend}
          onChange={(event) => setSpend(event.target.value)}
        />
        <button className="primary !min-h-11 !px-3 text-sm" disabled={busy} onClick={add}>
          Log
        </button>
      </div>
    </div>
  )
}

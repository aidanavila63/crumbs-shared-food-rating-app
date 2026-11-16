'use client'
// Round 77: "Near: Office ▾" at the top of Decide. Decide, Tonight, Surprise and Explore measure
// from the group's main location; swapping here only changes it on this phone, until Crumbs closes.
import type { Area, GroupLocation } from '@/hooks/use-crumbs-data'
import { mainLocation, type Anchor, type FromChoice } from '@/lib/anchor'
import { haptic } from '@/lib/motion'

export function FromPicker({
  choice,
  anchor,
  locations,
  mainId,
  mine,
  hasHome,
  onChoose,
}: {
  choice: FromChoice
  anchor: Anchor | null
  locations: GroupLocation[]
  mainId?: string | null
  mine: Area[]
  hasHome: boolean
  onChoose: (choice: FromChoice) => void
}) {
  // Nothing to choose between: say nothing.
  if (!locations.length && !mine.length) return null
  const main = mainLocation(locations, mainId)
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Near</span>
      <select
        className="field !min-h-9 !w-auto !py-1 text-sm"
        aria-label="Where “near” is measured from"
        value={choice}
        onChange={(event) => {
          haptic('select')
          onChoose(event.target.value)
        }}
      >
        <option value="auto">{main ? `⭐ ${main.name} (main)` : hasHome ? 'Home' : 'Not set'}</option>
        {locations
          .filter((l) => l.id !== main?.id)
          .map((l) => (
            <option key={l.id} value={`group:${l.id}`}>
              📍 {l.name}
            </option>
          ))}
        {mine.map((a) => (
          <option key={a.name} value={`me:${a.name}`}>
            🔒 {a.name}
          </option>
        ))}
        {hasHome && main && <option value="home">🏠 Home</option>}
        <option value="here">📡 Where I am</option>
      </select>
      {choice === 'here' && !anchor && <span className="text-xs text-muted-foreground">Finding you…</span>}
      {choice !== 'auto' && (
        <button className="text-xs text-primary underline" onClick={() => onChoose('auto')}>
          Back to main
        </button>
      )}
    </label>
  )
}

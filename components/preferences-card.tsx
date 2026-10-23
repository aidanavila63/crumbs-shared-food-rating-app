'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Profile } from '@/hooks/use-crumbs-data'
import { ALLERGENS, AVOID_OPTIONS } from '@/lib/place-info'

type Home = { lat: number; lng: number } | null

/** What you avoid, blind ratings, and your home spot. Warnings use everyone's avoid list. */
export function PreferencesCard({
  profile,
  userId,
  supabase,
  demo,
  home,
  onHome,
  onProfile,
}: {
  profile?: Profile | null
  userId?: string
  supabase: any
  demo: boolean
  home: Home
  onHome: (home: Home) => void
  onProfile: (changes: Partial<Profile>) => void
}) {
  const avoid = profile?.avoid ?? []
  const [locating, setLocating] = useState(false)

  async function save(changes: Partial<Profile>) {
    if (!userId) return
    const before = { avoid: profile?.avoid ?? [], blind_ratings: profile?.blind_ratings ?? false }
    onProfile(changes)
    if (demo) return
    const { error } = await supabase.from('profiles').update(changes).eq('id', userId)
    if (error) {
      onProfile(before)
      toast.error(error.message)
    }
  }
  const toggle = (key: string) =>
    save({ avoid: avoid.includes(key) ? avoid.filter((item) => item !== key) : [...avoid, key] })

  function setHere() {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onHome({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocating(false)
        toast.success('Home saved on this phone')
      },
      () => {
        setLocating(false)
        toast.error('Could not get your location. Allow location for this site and try again.')
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }
  const chip = (on: boolean) => `chip chip-sm ${on ? 'chip-active' : ''}`

  return (
    <div className="surface flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-2xl font-bold">What you avoid</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Places that clash get a warning, and Surprise us and Tonight skip them. Allergies and dietary needs:
          tag dishes with the same words.
        </p>
        <div className="chip-row mt-3">
          {AVOID_OPTIONS.map((option) => (
            <button key={option.key} aria-pressed={avoid.includes(option.key)} className={chip(avoid.includes(option.key))} onClick={() => toggle(option.key)}>
              {option.label}
            </button>
          ))}
          {ALLERGENS.map((item) => {
            const key = `a:${item.toLowerCase()}`
            return (
              <button key={key} aria-pressed={avoid.includes(key)} className={chip(avoid.includes(key))} onClick={() => toggle(key)}>
                No {item.toLowerCase()}
              </button>
            )
          })}
        </div>
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5"
          checked={!!profile?.blind_ratings}
          onChange={(event) => save({ blind_ratings: event.target.checked })}
        />
        <span>
          <span className="font-semibold">Blind ratings</span>
          <span className="block text-sm text-muted-foreground">
            Hide your partner’s scores on anything you haven’t rated yet. This is your own setting.
          </span>
        </span>
      </label>
      <div>
        <p className="font-semibold">Home</p>
        <p className="text-sm text-muted-foreground">
          {home ? 'Cards show how far each place is from home.' : 'Save where you live to see distances on cards.'} Saved on this phone only.
        </p>
        <div className="mt-2 flex gap-2">
          <button className="secondary" disabled={locating} onClick={setHere}>
            {locating ? 'Finding you…' : home ? 'Update to here' : '📍 Set home to here'}
          </button>
          {home && (
            <button className="secondary" onClick={() => onHome(null)}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

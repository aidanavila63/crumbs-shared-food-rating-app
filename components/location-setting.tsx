'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { autoLocation, onAutoLocation, setAutoLocation } from '@/lib/location'
import { Switch } from './switch'

const IPHONE_TIP =
  'On iPhone the popup can come back each time you open Crumbs. To stop it: iPhone Settings → Apps → Safari → Location → Allow.'

function isIphone() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
}

/** The switch in Settings → Look & feel. */
export function LocationSwitchRow() {
  const [on, setOn] = useState(() => autoLocation() === 'on')
  const [busy, setBusy] = useState(false)
  const [iphone] = useState(isIphone)
  useEffect(() => onAutoLocation(() => setOn(autoLocation() === 'on')), [])
  return (
    <div className="settings-row">
      <span>
        <span className="font-semibold">Update location when Crumbs opens</span>
        <span className="block text-sm text-muted-foreground">
          {on
            ? 'Search, the map, Nearest and distances use where you are now. Kept on this phone, never shown to your group.'
            : 'Off: Crumbs only uses your location when you tap something like Locate me or Nearest.'}
          {on && iphone && <span className="mt-1 block">{IPHONE_TIP}</span>}
        </span>
      </span>
      <Switch
        label="Update location when Crumbs opens"
        checked={on}
        disabled={busy}
        onChange={async (next) => {
          setOn(next)
          if (!next) return void setAutoLocation(false)
          setBusy(true)
          const fix = await setAutoLocation(true)
          setBusy(false)
          if (!fix)
            toast('Location is blocked for Crumbs. Allow it in your phone’s settings, then try again.')
        }}
      />
    </div>
  )
}

/**
 * Asked once per phone, before the phone's own popup, so the popup isn't a surprise.
 * Yes turns the switch on; Not now turns it off (both changeable in Settings).
 */
export function LocationPrompt({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="next-time-note mb-4 flex flex-col gap-2 text-sm" role="dialog" aria-label="Location">
      <p>
        <span className="font-semibold">📍 Find food near you?</span> Crumbs can check where you
        are each time it opens, so search, the map and distances start from where you are. It
        stays on this phone and is never shown to your group. You can turn it off in Settings.
      </p>
      <div className="flex gap-2">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const fix = await setAutoLocation(true)
            setBusy(false)
            if (!fix)
              toast('Location is blocked for Crumbs. You can allow it later in your phone’s settings.')
            onDone()
          }}
        >
          {busy ? 'Finding you…' : 'Yes, use my location'}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setAutoLocation(false)
            onDone()
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

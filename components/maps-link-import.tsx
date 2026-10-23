'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { useGoogleDown, markGoogleDown } from '@/lib/google-status'
import { findOnGoogle, findOnOsm, type FoundPlace } from './place-search'

/** Paste a Google Maps share link and get the place filled in (one search, no list import). */
export function MapsLinkImport({ onFound }: { onFound: (place: FoundPlace) => void }) {
  const places = useMapsLibrary('places')
  const googleDown = useGoogleDown()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!link.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/maps-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: link.trim() }),
      })
      const parsed = await response.json()
      if (!response.ok) throw new Error(parsed.error)
      const bias = parsed.lat !== null ? { lat: parsed.lat, lng: parsed.lng } : null
      let found: FoundPlace | null = null
      if (places && !googleDown) {
        try {
          found = await findOnGoogle(places, parsed.name, bias)
        } catch {
          if (navigator.onLine) markGoogleDown()
        }
      }
      found ??= await findOnOsm(parsed.name, bias)
      if (!found) throw new Error(`Couldn't find “${parsed.name}”. Try searching by name instead.`)
      onFound(found)
      setLink('')
      toast.success(`Found ${found.name}`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not read that link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-primary">
        Paste a Google Maps link
      </summary>
      <div className="mt-2 flex gap-2">
        <input
          aria-label="Google Maps link"
          className="field min-w-0 flex-1"
          inputMode="url"
          placeholder="https://maps.app.goo.gl/…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && run()}
        />
        <button className="secondary !min-h-11 !px-3" disabled={busy} onClick={run}>
          {busy ? 'Reading…' : 'Import'}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        In Google Maps tap Share → Copy link on a place, then paste it here. One place at a time.
      </p>
    </details>
  )
}

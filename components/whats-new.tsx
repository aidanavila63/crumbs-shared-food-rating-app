'use client'
// U19 (Round 87): a "What's new" card after an update, once per batch. Bump WHATS_NEW.id and the
// lines whenever there's something worth telling people about.
import { useState, useSyncExternalStore } from 'react'
import { Sparkles, X } from 'lucide-react'

export const WHATS_NEW = {
  id: '2026-11-r87',
  lines: [
    'My Crumbs: your own private food map, next to your groups',
    'Your recipes are yours now, shared into the groups you pick',
    'Find a dish across Crumbs (Decide tab)',
    'Filter places by what’s open and by Good to know details',
    'Mute a group or set quiet hours (Settings → Notify me about)',
  ],
}

const KEY = 'crumbs-whats-new'
const subscribe = () => () => {}
function readSeen() {
  try {
    return localStorage.getItem(KEY) === WHATS_NEW.id
  } catch {
    return true
  }
}

export function WhatsNew() {
  // The server can't see this phone's storage, so it draws nothing; the phone then checks.
  const stored = useSyncExternalStore(subscribe, readSeen, () => true)
  const [closed, setClosed] = useState(false)
  const seen = stored || closed
  if (seen) return null
  return (
    <div className="surface rise-panel flex flex-col gap-2" role="status">
      <div className="flex items-center justify-between gap-2">
        <h2 className="card-heading flex items-center gap-2">
          <Sparkles size={18} className="text-primary" aria-hidden="true" /> What’s new
        </h2>
        <button
          className="icon-btn"
          aria-label="Got it"
          onClick={() => {
            try {
              localStorage.setItem(KEY, WHATS_NEW.id)
            } catch {}
            setClosed(true)
          }}
        >
          <X size={16} />
        </button>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {WHATS_NEW.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

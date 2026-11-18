'use client'
// U19 (Round 87): a "What's new" card after an update, once per batch. Bump WHATS_NEW.id and the
// lines whenever there's something worth telling people about.
import { useState, useSyncExternalStore } from 'react'
import { Sparkles, X } from 'lucide-react'

export const WHATS_NEW = {
  id: '2026-11-r91',
  lines: [
    'Make your own version of any recipe — it always credits the original',
    'Recipes: servings, times, Cook mode and a shopping list',
    'Thousands of GTA restaurants now show up in search',
    'Filter places open “For dinner” or for a “Night out”',
    'Get a notification when someone reacts to your rating or recipe',
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

'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { notifyMates } from '@/lib/push'

/** "I'm craving ___" sends your partner a quick notification. Only shown once notifications are set up. */
export function CravingButton({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return null
  function send() {
    const what = text.trim()
    if (!what) return
    notifyMates({ type: 'craving', groupId, text: what })
    toast.success('Sent. They’ll get a nudge.')
    setText('')
    setOpen(false)
  }
  if (!open)
    return (
      <button className="secondary !min-h-10 shrink-0 !px-3 text-sm" onClick={() => setOpen(true)}>
        🍜 Craving…
      </button>
    )
  return (
    <div className="flex w-full gap-2">
      <input
        aria-label="What are you craving?"
        autoFocus
        className="field"
        maxLength={40}
        placeholder="I'm craving… (ramen, tacos)"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
      />
      <button className="primary shrink-0" disabled={!text.trim()} onClick={send}>
        Send
      </button>
      <button className="secondary shrink-0" aria-label="Cancel" onClick={() => setOpen(false)}>
        ×
      </button>
    </div>
  )
}

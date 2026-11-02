'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { notifyMates } from '@/lib/push'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

const QUICK = ['ramen', 'tacos', 'sushi', 'pizza', 'burgers', 'pho', 'curry', 'dessert', 'brunch', 'wings']

/** "I'm craving ___" sends the rest of the group a quick nudge (needs notifications set up). */
export function CravingButton({ groupId, className = '' }: { groupId: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  const ready = demo || !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  function send(what = text.trim()) {
    if (!what) return
    if (!demo) notifyMates({ type: 'craving', groupId, text: what })
    haptic('success')
    toast.success(`Sent “craving ${what}” — they’ll get a nudge.`)
    setText('')
    setOpen(false)
  }
  return (
    <>
      <button
        className={`secondary ${className}`}
        onClick={() => {
          haptic('tap')
          setOpen(true)
        }}
      >
        🍜 I’m craving…
      </button>
      {open && (
        <Overlay label="I'm craving" title="I’m craving…" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            {!ready ? (
              <p className="surface-soft text-sm">
                Cravings are sent as a notification, which isn’t set up on this Crumbs yet.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Everyone in the group gets a nudge (if they’ve turned notifications on).
                </p>
                <div className="chip-row">
                  {QUICK.map((q) => (
                    <button key={q} className="chip" onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    aria-label="What are you craving?"
                    className="field"
                    maxLength={40}
                    placeholder="Something else…"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && send()}
                  />
                  <button className="primary shrink-0" disabled={!text.trim()} onClick={() => send()}>
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </Overlay>
      )}
    </>
  )
}

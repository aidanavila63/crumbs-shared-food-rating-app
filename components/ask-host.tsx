'use client'
import { useEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/motion'
import { registerAsk, type AskRequest } from '@/lib/ask'
import { isTopLayer, pushLayer } from '@/lib/layers'

/** Renders the one open in-app confirm/prompt. Mounted once at the root. */
export function AskHost() {
  const [req, setReq] = useState<AskRequest | null>(null)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    registerAsk((next) => {
      setReq((current) => {
        current?.resolve(current.input ? null : false) // a newer question cancels the older
        return next
      })
      if (next?.input) setText(next.input.value)
    })
    return () => registerAsk(null)
  }, [])

  useEffect(() => {
    if (!req) return
    const previous = document.activeElement as HTMLElement | null
    const me = {}
    const release = pushLayer(me)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopLayer(me)) {
        event.stopImmediatePropagation()
        finish(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => {
      if (input.current) {
        input.current.focus()
        input.current.select()
      } else confirmBtn.current?.focus()
    })
    return () => {
      release()
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])

  function finish(ok: boolean) {
    if (!req) return
    if (ok) haptic(req.danger ? 'warn' : 'tap')
    req.resolve(req.input ? (ok ? text : null) : ok)
    setReq(null)
  }

  if (!req) return null
  return (
    <div
      className="ask-backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && finish(false)}
    >
      <div
        className="ask-card"
        role={req.input ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="ask-title"
        aria-describedby={req.body ? 'ask-body' : undefined}
      >
        <h2 id="ask-title" className="font-serif text-xl font-bold leading-tight">
          {req.title}
        </h2>
        {req.body && (
          <p id="ask-body" className="text-sm text-muted-foreground">
            {req.body}
          </p>
        )}
        {req.input && (
          <input
            ref={input}
            className="field"
            aria-label={req.input.label}
            value={text}
            maxLength={80}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && finish(true)}
          />
        )}
        <div className="ask-actions">
          <button type="button" className="secondary" onClick={() => finish(false)}>
            Cancel
          </button>
          <button
            ref={confirmBtn}
            type="button"
            className={req.danger ? 'primary ask-danger' : 'primary'}
            disabled={!!req.input && !text.trim()}
            onClick={() => finish(true)}
          >
            {req.confirm ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

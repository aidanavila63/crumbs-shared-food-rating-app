'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { haptic, motionAllowed } from '@/lib/motion'

// Open overlays, newest last, so Escape only closes the one on top.
const stack: object[] = []

/**
 * Full-screen panel that opens with an animation when you tap a button (no swipe gestures)
 * and closes with the round ✕ at the bottom centre or Escape.
 * variant="menu": dimmed, blurred backdrop for a ring of round buttons (Pokémon GO style).
 * variant="panel": a "journal" page of cards.
 */
export function Overlay({
  label,
  title,
  onClose,
  variant = 'panel',
  action,
  children,
}: {
  label: string
  title?: string
  onClose: () => void
  variant?: 'menu' | 'panel' | 'story'
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [closing, setClosing] = useState(false)
  const done = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const close = useCallback(() => {
    if (done.current) return
    done.current = true
    haptic('tap')
    if (!motionAllowed()) return onCloseRef.current()
    setClosing(true)
    setTimeout(() => onCloseRef.current(), 170)
  }, [])

  useEffect(() => {
    haptic('tap')
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const me = {}
    stack.push(me)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && stack.at(-1) === me && close()
    window.addEventListener('keydown', onKey)
    return () => {
      stack.splice(stack.indexOf(me), 1)
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [close])

  return (
    <div
      className={`overlay overlay-${variant} ${closing ? 'overlay-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="overlay-scroll">
        {(title || action) && (
          <header className="overlay-header">
            {title && <h2 className="font-serif text-3xl font-bold">{title}</h2>}
            {action && <div className="overlay-action">{action}</div>}
          </header>
        )}
        <div className="overlay-body">{children}</div>
      </div>
      <button type="button" className="overlay-close" aria-label={`Close ${label}`} onClick={close}>
        <X size={26} strokeWidth={2.5} />
      </button>
    </div>
  )
}

'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { haptic, motionAllowed } from '@/lib/motion'
import { isTopLayer, pushLayer } from '@/lib/layers'

/**
 * Accessible bottom sheet: dialog semantics, Escape to close (top layer only), scroll lock,
 * focus restore. Closing with ✕, the backdrop or Escape slides it away first.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
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
    setTimeout(() => onCloseRef.current(), 200)
  }, [])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const me = {}
    const release = pushLayer(me)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && isTopLayer(me) && close()
    window.addEventListener('keydown', onKey)
    return () => {
      release()
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [close])
  return (
    <div
      className={`sheet-backdrop ${closing ? 'sheet-closing' : ''}`}
      onPointerDown={(event) => event.target === event.currentTarget && close()}
    >
      <section ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </section>
      {/* Always there, wherever you've scrolled to (outside the sheet so it never scrolls away). */}
      <button
        type="button"
        className="overlay-close sheet-close"
        aria-label={`Close ${label}`}
        onClick={close}
      >
        <X size={26} strokeWidth={2.5} />
      </button>
    </div>
  )
}

'use client'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/** Accessible bottom sheet: dialog semantics, Escape to close, scroll lock, focus restore. */
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // An open full-screen page (Overlay) handles Escape first.
    const onKey = (event: KeyboardEvent) =>
      event.key === 'Escape' && !document.querySelector('.overlay') && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
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
        onClick={onClose}
      >
        <X size={26} strokeWidth={2.5} />
      </button>
    </div>
  )
}

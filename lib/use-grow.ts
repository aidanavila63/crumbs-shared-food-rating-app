'use client'
// E10 (Round 77): a long list draws its first rows straight away and the rest as you scroll
// (60 at a time), instead of every card at once (slow on a phone with hundreds of places).
import { useEffect, useState } from 'react'

export const GROW_STEP = 60

export function useGrow<T>(items: T[], step = GROW_STEP) {
  const [count, setCount] = useState(step)
  const [seen, setSeen] = useState(items)
  const [node, setNode] = useState<HTMLElement | null>(null)
  // A new search or filter starts from the top again (React's "adjust state on a prop change").
  if (seen !== items) {
    setSeen(items)
    setCount(step)
  }
  useEffect(() => {
    if (!node || count >= items.length || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setCount((n) => n + step),
      { rootMargin: '800px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, count, items.length, step])
  return {
    shown: items.slice(0, count),
    more: Math.max(0, items.length - count),
    /** put on the element after the last row */
    sentinel: setNode,
    showAll: () => setCount(items.length),
  }
}

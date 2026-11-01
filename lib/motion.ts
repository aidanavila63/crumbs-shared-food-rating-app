'use client'
// Animation + vibration preferences (saved on this phone) and small motion helpers.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

export type MotionPrefs = { animations: boolean; haptics: boolean }
const KEY = 'crumbs-motion'
const DEFAULTS: MotionPrefs = { animations: true, haptics: true }
let current: MotionPrefs = DEFAULTS
let loaded = false
const listeners = new Set<() => void>()

function read(): MotionPrefs {
  if (loaded || typeof window === 'undefined') return current
  loaded = true
  try {
    current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    current = DEFAULTS
  }
  apply()
  return current
}

function apply() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.motion = current.animations ? 'on' : 'off'
}

export function setMotionPrefs(changes: Partial<MotionPrefs>) {
  current = { ...read(), ...changes }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {}
  apply()
  listeners.forEach((listener) => listener())
}

export function useMotionPrefs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    () => DEFAULTS,
  )
}

/** True when animations should run (setting on and the phone isn't set to reduce motion). */
export function motionAllowed() {
  if (typeof window === 'undefined') return false
  if (!read().animations) return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Can this device vibrate? (Android browsers yes; iPhone Safari has no vibration API.) */
export const canVibrate = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

const PATTERNS = {
  tap: 8,
  select: 12,
  success: [14, 40, 22],
  celebrate: [18, 50, 18, 50, 30],
  warn: [10, 30, 10],
} as const
export type HapticKind = keyof typeof PATTERNS

/** A short buzz on phones that support it, unless vibration is turned off in Settings. */
export function haptic(kind: HapticKind = 'tap') {
  if (!canVibrate() || !read().haptics) return
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[])
  } catch {}
}

/** Counts up from 0 (or the previous value) to `value` on change. Instant when motion is off. */
export function useCountUp(value: number, duration = 700) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    if (!motionAllowed() || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(begin + (value - begin) * eased))
      if (t < 1) frame = requestAnimationFrame(step)
      else from.current = value
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return shown
}

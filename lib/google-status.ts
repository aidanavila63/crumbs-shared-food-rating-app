'use client'
// Tracks whether Google Maps/Places has stopped working (daily quota hit, bad key, etc.)
// so search and the map can switch to OpenStreetMap. Remembered for 30 minutes per tab.
import { useSyncExternalStore } from 'react'

const KEY = 'crumbs-google-down'
const WINDOW_MS = 30 * 60 * 1000
const listeners = new Set<() => void>()
let down = false

function readStored() {
  try {
    const stamp = Number(sessionStorage.getItem(KEY))
    return Boolean(stamp) && Date.now() - stamp < WINDOW_MS
  } catch {
    return false
  }
}

export function isGoogleDown() {
  return down || readStored()
}

export function markGoogleDown() {
  if (isGoogleDown()) return
  down = true
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {}
  listeners.forEach((listener) => listener())
}

export function useGoogleDown() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isGoogleDown,
    () => false,
  )
}

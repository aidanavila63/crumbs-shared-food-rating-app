'use client'
// #79 Theme (Auto / Light / Dark) and accent colour, saved on this phone.
import { useSyncExternalStore } from 'react'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type Accent = 'plum' | 'tomato' | 'ocean' | 'forest' | 'saffron'
export type ThemePrefs = { theme: ThemeMode; accent: Accent }

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'plum', label: 'Plum', swatch: '#7b2d5b' },
  { id: 'tomato', label: 'Tomato', swatch: '#b23a26' },
  { id: 'ocean', label: 'Ocean', swatch: '#1f5f8b' },
  { id: 'forest', label: 'Forest', swatch: '#2f6b4a' },
  { id: 'saffron', label: 'Saffron', swatch: '#8f5a06' },
]

export const THEME_KEY = 'crumbs-theme'
const DEFAULTS: ThemePrefs = { theme: 'auto', accent: 'plum' }
let current = DEFAULTS
let loaded = false
const listeners = new Set<() => void>()

function read() {
  if (loaded || typeof window === 'undefined') return current
  loaded = true
  try {
    current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(THEME_KEY) ?? '{}') }
  } catch {}
  return current
}

function apply() {
  const root = document.documentElement
  if (current.theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = current.theme
  if (current.accent === 'plum') delete root.dataset.accent
  else root.dataset.accent = current.accent
}

export function setThemePrefs(changes: Partial<ThemePrefs>) {
  current = { ...read(), ...changes }
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(current))
  } catch {}
  apply()
  listeners.forEach((listener) => listener())
}

export function useThemePrefs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    () => DEFAULTS,
  )
}

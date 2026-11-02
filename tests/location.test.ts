import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownArea, middleOf } from '../lib/location.ts'

test('middleOf ignores places without a pin and resists one far-away trip', () => {
  const toronto = [
    { latitude: 43.65, longitude: -79.38 },
    { latitude: 43.7, longitude: -79.4 },
    { latitude: 43.66, longitude: -79.39 },
    { latitude: -8.65, longitude: 115.2 }, // a trip to Bali
    { latitude: null, longitude: null },
  ]
  const mid = middleOf(toronto)!
  assert.ok(Math.abs(mid.lat - 43.655) < 0.01, `lat ${mid.lat}`)
  assert.ok(Math.abs(mid.lng - -79.385) < 0.01, `lng ${mid.lng}`)
  assert.equal(middleOf([]), null)
  assert.equal(middleOf([{ latitude: null, longitude: 3 }]), null)
})

test('knownArea falls back when nothing is remembered', () => {
  assert.equal(knownArea(), null)
  assert.deepEqual(knownArea({ lat: 1, lng: 2 }), { lat: 1, lng: 2 })
})

test('"update location when Crumbs opens" switch decides background use', async () => {
  const store = new Map<string, string>()
  ;(globalThis as any).window = globalThis
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  }
  let calls = 0
  let answer: 'yes' | 'no' = 'yes'
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      permissions: { query: async () => ({ state: 'prompt' }) },
      geolocation: {
        getCurrentPosition: (ok: any, fail: any) => {
          calls++
          if (answer === 'yes') ok({ coords: { latitude: 43.6532, longitude: -79.3832 } })
          else fail({ code: 1, PERMISSION_DENIED: 1 })
        },
      },
    },
  })
  const loc = await import('../lib/location.ts')

  // Not chosen yet + popup not allowed: background never asks.
  assert.equal(loc.autoLocation(), null)
  assert.equal(await loc.locate({ ask: false }), null)
  assert.equal(calls, 0)

  // On: switching on asks right away and saves the fix (rounded to ~100 m).
  const fix = await loc.setAutoLocation(true)
  assert.deepEqual(fix, { lat: 43.653, lng: -79.383 })
  assert.equal(calls, 1)
  assert.equal(loc.autoLocation(), 'on')

  // Off: forgets the fix and background uses get nothing, without asking.
  await loc.setAutoLocation(false)
  assert.equal(loc.lastFix(loc.AREA), null)
  assert.equal(await loc.locate({ ask: false }), null)
  assert.equal(calls, 1)

  // On but refused: stops asking in the background until switched on again.
  answer = 'no'
  assert.equal(await loc.setAutoLocation(true), null)
  assert.equal(loc.locationDenied(), true)
  assert.equal(await loc.locate({ ask: false }), null)
  assert.equal(calls, 2)
})

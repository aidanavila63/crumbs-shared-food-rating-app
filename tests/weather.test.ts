import test from 'node:test'
import assert from 'node:assert/strict'
import { fitsNudge, weatherNudge } from '../lib/weather.ts'

test('rain suggests comfort food and matches ramen places', () => {
  const nudge = weatherNudge({ temp: 12, code: 63, isDay: false })!
  assert.equal(nudge.emoji, '🌧️')
  assert.equal(fitsNudge({ name: 'Hana', cuisine: 'Ramen', tags: [] }, nudge), true)
  assert.equal(fitsNudge({ name: 'Taquería Sol', cuisine: 'Mexican', tags: [] }, nudge), false)
})

test('hot days suggest patio food, mild cloudy days say nothing', () => {
  assert.equal(weatherNudge({ temp: 29.4, code: 0, isDay: true })!.text.startsWith('29°'), true)
  assert.equal(weatherNudge({ temp: 12, code: 3, isDay: true }), null)
  assert.equal(weatherNudge(null), null)
})

test('storms beat temperature', () => {
  assert.equal(weatherNudge({ temp: 30, code: 95, isDay: true })!.emoji, '⛈️')
})

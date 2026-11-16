import test from 'node:test'
import assert from 'node:assert/strict'
import { GROUP_FROM_PINS, groupPins } from '../lib/pin-groups.ts'

const near = (i: number) => ({ id: `n${i}`, lat: 43.65 + i * 0.0001, lng: -79.38 })
const far = (i: number) => ({ id: `f${i}`, lat: 43 + i, lng: -79 - i })

test('few pins are never grouped', () => {
  assert.equal(groupPins([near(1), near(2)], 5).length, 2)
})

test('pins on top of each other become one bubble when zoomed out', () => {
  const pins = [...Array.from({ length: GROUP_FROM_PINS }, (_, i) => near(i)), far(1), far(2)]
  const groups = groupPins(pins, 10)
  const big = groups.find((g) => g.items.length > 1)!
  assert.equal(big.items.length, GROUP_FROM_PINS)
  assert.equal(groups.filter((g) => g.items.length === 1).length, 2)
  assert.ok(big.key.startsWith('group:'))
  // zoomed right in, every pin is its own again
  assert.equal(groupPins(pins, 16).length, pins.length)
  // nothing lost
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), pins.length)
})

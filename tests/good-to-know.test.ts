import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownFacts, menuAgeMonths, priceLevelFromSpend } from '../lib/good-to-know.ts'

const s = (yes: number, no: number, verdict: boolean | null, owner: boolean | null = null) => ({
  yes,
  no,
  mine: null,
  owner,
  verdict,
})

test('known facts: confirmed yes/no, warnings first, group dealbreakers', () => {
  const facts = knownFacts({
    attrs: {
      patio: s(2, 0, true),
      cash_only: s(3, 1, true),
      licensed: s(0, 2, false),
      tap: s(1, 0, null),
      step_free: s(0, 0, false, false),
    },
    groups: {
      loud: true,
      hard_parking: false,
      long_wait: false,
      cash_only: true,
      not_accessible: true,
    },
  })
  assert.deepEqual(
    facts.map((f) => f.label),
    ['Cash only', 'Steps at the door', 'Often loud', 'Patio', 'No alcohol'],
  )
  assert.equal(facts.find((f) => f.label === 'Steps at the door')!.owner, true)
  assert.deepEqual(knownFacts(null), [])
})

test('price level from spend and menu age', () => {
  assert.equal(priceLevelFromSpend(12), 1)
  assert.equal(priceLevelFromSpend(31), 3)
  assert.equal(priceLevelFromSpend(null), null)
  const now = new Date('2026-10-25')
  assert.equal(
    menuAgeMonths([{ price_checked_at: '2026-03-01' }, { price_checked_at: '2026-04-20' }], now),
    6,
  )
  assert.equal(menuAgeMonths([], now), null)
})

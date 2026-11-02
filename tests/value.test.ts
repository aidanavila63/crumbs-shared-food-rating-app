import test from 'node:test'
import assert from 'node:assert/strict'
import { costPerHead, usualCost, valueScore } from '../lib/value.ts'

const visit = (spend: number | null, people: number | null) => ({ spend, people }) as any
const place = (stars: number[], visits: any[]): any => ({
  status: 'Been',
  place_ratings: stars.map((score, i) => ({ user_id: String(i), score, notes: null })),
  place_visits: visits,
})

test('cost a person and your usual', () => {
  assert.equal(costPerHead({ place_visits: [visit(60, 2), visit(40, 2)] } as any), 25)
  // no head count → the group's size
  assert.equal(costPerHead({ place_visits: [visit(30, null)] } as any, 3), 10)
  assert.equal(costPerHead({ place_visits: [] } as any), null)
  const places = [20, 30, 40, 100].map((c) => ({ place_visits: [visit(c, 1)] }) as any)
  assert.equal(usualCost(places), 35)
  assert.equal(usualCost(places.slice(0, 2)), null) // not enough to compare
})

test('value goes up when cheaper than usual, down when pricier', () => {
  const usual = 30
  assert.equal(valueScore(place([4.5], [visit(30, 1)]), usual)?.score, 9) // same price
  assert.equal(valueScore(place([4.5], [visit(15, 1)]), usual)?.score, 10) // half price
  assert.equal(valueScore(place([4.5], [visit(60, 1)]), usual)?.score, 6) // double
  assert.equal(valueScore(place([3], [visit(60, 1)]), usual)?.label, 'Pricey for what it is')
  assert.equal(valueScore(place([], [visit(30, 1)]), usual), null)
  assert.equal(valueScore(place([5], []), usual), null)
})

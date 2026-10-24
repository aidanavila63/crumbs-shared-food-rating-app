import test from 'node:test'
import assert from 'node:assert/strict'
import { nearEnough } from '../lib/here.ts'

test('only ask about the pin when you are right there', () => {
  const pin = { lat: 43.6532, lng: -79.3832 }
  assert.equal(nearEnough({ lat: 43.6535, lng: -79.3834, accuracy: 20 }, pin), true) // ~40 m
  assert.equal(nearEnough({ lat: 43.66, lng: -79.3832, accuracy: 20 }, pin), false) // ~760 m
  assert.equal(nearEnough({ lat: 43.6535, lng: -79.3834, accuracy: 300 }, pin), false) // fuzzy fix
  assert.equal(nearEnough(null, pin), false)
  assert.equal(nearEnough({ lat: 1, lng: 1, accuracy: 5 }, { lat: null, lng: null }), false)
})

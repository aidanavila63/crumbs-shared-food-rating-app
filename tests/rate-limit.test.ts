import test from 'node:test'
import assert from 'node:assert/strict'
import { tooManyRequests } from '../lib/rate-limit.ts'

test('blocks after the limit, per user', () => {
  for (let i = 0; i < 12; i++) assert.equal(tooManyRequests('a'), false)
  assert.equal(tooManyRequests('a'), true)
  assert.equal(tooManyRequests('b'), false)
})

test('window expires', () => {
  for (let i = 0; i < 3; i++) tooManyRequests('c', 3, 30)
  assert.equal(tooManyRequests('c', 3, 30), true)
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      assert.equal(tooManyRequests('c', 3, 30), false)
      resolve()
    }, 50),
  )
})

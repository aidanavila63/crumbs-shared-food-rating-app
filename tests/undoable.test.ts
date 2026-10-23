import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingDeletes, undoableDelete } from '../lib/undoable.ts'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('hides at once, tracks pending, commits after the delay', async () => {
  const log: string[] = []
  undoableDelete({
    id: 'a',
    message: 'x',
    delay: 30,
    hide: () => log.push('hide'),
    restore: () => log.push('restore'),
    commit: async () => {
      log.push('commit')
      return null
    },
  })
  assert.deepEqual(log, ['hide'])
  assert.equal(pendingDeletes.has('a'), true)
  await wait(70)
  assert.deepEqual(log, ['hide', 'commit'])
  assert.equal(pendingDeletes.has('a'), false)
})

test('restores the item when the delete fails', async () => {
  const log: string[] = []
  undoableDelete({
    id: 'b',
    message: 'y',
    delay: 30,
    hide: () => log.push('hide'),
    restore: () => log.push('restore'),
    commit: async () => ({ message: 'nope' }),
  })
  await wait(70)
  assert.deepEqual(log, ['hide', 'restore'])
  assert.equal(pendingDeletes.has('b'), false)
})

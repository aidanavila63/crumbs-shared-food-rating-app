import test from 'node:test'
import assert from 'node:assert/strict'
import { isLetIn } from '../lib/let-in.ts'

const db = (answer: unknown) => ({ rpc: async () => answer })

test('only a clear yes from the database lets a route run', async () => {
  assert.equal(await isLetIn(db({ data: true, error: null }), 'u'), true)
  assert.equal(await isLetIn(db({ data: false, error: null }), 'u'), false)
  assert.equal(await isLetIn(db({ data: null, error: null }), 'u'), false)
})

test('a database hiccup means no; a database without the gate means there is no gate', async () => {
  assert.equal(await isLetIn(db({ data: null, error: { code: '57014', message: 'timeout' } }), 'u'), false)
  assert.equal(await isLetIn(db({ data: null, error: { code: 'PGRST202' } }), 'u'), true)
  assert.equal(await isLetIn({ rpc: async () => { throw new Error('offline') } }, 'u'), false)
})

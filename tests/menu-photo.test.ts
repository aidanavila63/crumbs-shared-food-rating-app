import test from 'node:test'
import assert from 'node:assert/strict'
import { parseImage } from '../lib/menu-photo.ts'

test('only images of a sensible size go to the AI', () => {
  assert.deepEqual(parseImage('data:image/jpeg;base64,QUJD'), {
    mediaType: 'image/jpeg',
    base64: 'QUJD',
  })
  assert.equal(parseImage('data:text/html;base64,QUJD'), null)
  assert.equal(parseImage('data:image/jpeg;base64,' + 'A'.repeat(3_000_000)), null)
  assert.equal(parseImage(42), null)
})

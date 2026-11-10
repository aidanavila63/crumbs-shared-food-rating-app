import { test } from 'node:test'
import assert from 'node:assert/strict'
import { thumbPath } from '../lib/photos.ts'

test('thumbs: small copy sits next to the photo', () => {
  const g = '11111111-1111-1111-1111-111111111111'
  const p = '22222222-2222-2222-2222-222222222222'
  assert.equal(thumbPath(`${g}/${p}.jpg`), `${g}/${p}.t.jpg`)
  assert.equal(thumbPath(`r2/${g}/${p}.jpg`), null) // R2 has no download fees
  assert.equal(thumbPath(`${g}/${p}.t.jpg`), null) // never a thumb of a thumb
  assert.equal(thumbPath('avatars/x.png'), null)
  assert.equal(thumbPath(null), null)
})

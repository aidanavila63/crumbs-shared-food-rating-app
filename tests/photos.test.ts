import test from 'node:test'
import assert from 'node:assert/strict'
import { photoUrl, r2Key, usesR2 } from '../lib/photos.ts'

const g = '11111111-2222-3333-4444-555555555555'
const f = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

test('R2 photos live next to the old ones (#80)', () => {
  assert.equal(usesR2(`r2/${g}/${f}.jpg`), true)
  assert.equal(usesR2(`${g}/${f}.jpg`), false)
  assert.equal(
    photoUrl(`r2/${g}/${f}.jpg`, 'https://img.example.com/'),
    `https://img.example.com/${g}/${f}.jpg`,
  )
  assert.equal(photoUrl(`r2/${g}/${f}.jpg`, ''), null)
  assert.deepEqual(r2Key(`r2/${g}/${f}.jpg`), { key: `${g}/${f}.jpg`, groupId: g })
  assert.equal(r2Key(`r2/${g}/../../secret.jpg`), null)
  assert.equal(r2Key(`${g}/${f}.jpg`), null)
})

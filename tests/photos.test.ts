import test from 'node:test'
import assert from 'node:assert/strict'
import { pathFromUrl, photoUrl, r2Key, usesR2 } from '../lib/photos.ts'

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
  assert.deepEqual(r2Key(`r2/${g}/${f}.jpg`), {
    key: `${g}/${f}.jpg`,
    thumbKey: `${g}/${f}.t.jpg`,
    folder: g,
  })
  // Profile photos are saved as full links: the clean-up needs the path back.
  assert.equal(
    pathFromUrl(`https://x.supabase.co/storage/v1/object/public/crumbs-photos/${g}/${f}.jpg`),
    `${g}/${f}.jpg`,
  )
  assert.equal(
    pathFromUrl(`https://img.example.com/${g}/${f}.jpg`, 'https://img.example.com/'),
    `r2/${g}/${f}.jpg`,
  )
  assert.equal(pathFromUrl('https://lh3.googleusercontent.com/a/abc', 'https://img.example.com'), null)
  assert.equal(r2Key(`r2/${g}/../../secret.jpg`), null)
  assert.equal(r2Key(`${g}/${f}.jpg`), null)
})

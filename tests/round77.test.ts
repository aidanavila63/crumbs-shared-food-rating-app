import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSiteUrl } from '../lib/site.ts'
import { jobIsLate } from '../lib/jobs-shared.ts'
import { hasSession } from '../lib/session-cookie.ts'
import { invitePath } from '../lib/invite.ts'
import { listedKeys } from '../lib/r2-list.ts'
import { heirs } from '../lib/heirs.ts'

test('the site address setting is tidied, junk ignored', () => {
  assert.equal(cleanSiteUrl('crumbs.example.com/'), 'https://crumbs.example.com')
  assert.equal(cleanSiteUrl(' https://crumbs.example.com/path '), 'https://crumbs.example.com')
  assert.equal(cleanSiteUrl(''), null)
  assert.equal(cleanSiteUrl('not a url at all'), null)
})

test('a scheduled job is overdue after its allowance', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  assert.equal(jobIsLate('daily', '2026-11-15T12:00:00Z', now), false)
  assert.equal(jobIsLate('daily', '2026-11-14T12:00:00Z', now), true)
  assert.equal(jobIsLate('backup', '2026-11-09T12:00:00Z', now), false)
  assert.equal(jobIsLate('backup', null, now), true)
  assert.equal(jobIsLate('something-else', null, now), false)
})

test('signed-out visitors are told apart by the sign-in cookie only', () => {
  assert.equal(hasSession(['sb-abcd-auth-token']), true)
  assert.equal(hasSession(['sb-abcd-auth-token.0', 'sb-abcd-auth-token.1']), true)
  assert.equal(hasSession(['crumbs-theme', 'sb-abcd-auth-token-code-verifier']), false)
  assert.equal(hasSession([]), false)
})

test('invite paths are unchanged', () => {
  assert.equal(invitePath(' abc234 '), '/invite/ABC234')
})

test('the off-site backup list is read from the R2 answer', () => {
  const xml = '<ListBucketResult><Contents><Key>crumbs-2026-11-09.json.gz</Key></Contents><Contents><Key>crumbs-2026-11-16.json.gz</Key></Contents></ListBucketResult>'
  assert.deepEqual(listedKeys(xml), ['crumbs-2026-11-09.json.gz', 'crumbs-2026-11-16.json.gz'])
})

test('when the owner leaves, admins come first and guests never take over', () => {
  const members = [
    { id: 'o', display_name: 'O', avatar_url: null, role: 'owner' as const },
    { id: 'g', display_name: 'G', avatar_url: null, role: 'guest' as const },
    { id: 'm', display_name: 'M', avatar_url: null, role: 'member' as const },
    { id: 'a', display_name: 'A', avatar_url: null, role: 'admin' as const },
  ]
  assert.deepEqual(heirs(members, 'o').map((m) => m.id), ['a', 'm'])
})

import { isSensitive, withoutReported } from '../lib/good-to-know.ts'
test('a reported allergen or diet detail is hidden until checked; other reports are not', () => {
  const facts = [
    { label: 'Gluten-free options', key: 'gluten_free_options' },
    { label: 'Patio', key: 'patio' },
  ]
  const { shown, hidden } = withoutReported(facts, [
    { detail: 'gluten_free_options', sensitive: true },
    { detail: 'patio', sensitive: false },
  ])
  assert.deepEqual(shown.map((f) => f.label), ['Patio'])
  assert.equal(hidden, 1)
  assert.equal(isSensitive('gluten_free_options'), true)
  assert.equal(isSensitive('hours'), false)
})

import { movedTo } from '../lib/session-cookie.ts'
test('the old address sends people to the new one, live site only', () => {
  const old = new URL('https://crumbs-shared-food-rating-app.vercel.app/r/toronto/pho?x=1')
  assert.equal(movedTo(old, 'https://crumbs.example', 'production'), 'https://crumbs.example/r/toronto/pho?x=1')
  assert.equal(movedTo(old, 'https://crumbs.example', 'preview'), null)
  assert.equal(movedTo(old, '', 'production'), null)
  assert.equal(movedTo(new URL('https://crumbs.example/'), 'https://crumbs.example', 'production'), null)
  assert.equal(movedTo(new URL('https://x.vercel.app/api/daily'), 'https://crumbs.example', 'production'), null)
})

import { mergeNearby, ownToPlaces } from '../lib/nearby.ts'
test('nearby: our own restaurants first, the same place from OpenStreetMap left out', () => {
  const own = ownToPlaces([
    { source_key: 'ovt:1', name: 'Crêperie Tranquille', latitude: 43.7, longitude: -79.4, cuisine: 'Café' },
  ])
  const spot = (id: string, name: string, lat: number) => ({
    google_place_id: id, name, formatted_address: null, latitude: lat, longitude: -79.4,
    price_level: null, cuisine: null, website: null, google_maps_url: null,
  })
  const merged = mergeNearby(own, [spot('osm:N1', 'Creperie Tranquille', 43.7002), spot('osm:N2', 'Other Place', 43.701)])
  assert.deepEqual(merged.map((m) => m.google_place_id), ['ovt:1', 'osm:N2'])
})

import { parseCsvLine, toRows } from '../scripts/overture/load.mjs'
test('the Overture CSV is read safely (quotes, empty cells, bad websites)', () => {
  assert.deepEqual(parseCsvLine('a,"b, c","say ""hi"""'), ['a', 'b, c', 'say "hi"'])
  const rows = toRows('id,name,latitude,longitude,website,confidence\nx1,"Pho, Place",43.7,-79.4,javascript:alert(1),0.9\nx2,,43.7,-79.4,,\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Pho, Place')
  assert.equal(rows[0].website, null)
  assert.equal(rows[0].confidence, 0.9)
})

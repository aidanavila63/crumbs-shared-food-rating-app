import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanWebsite, cuisineFromTag, isFoodFeature, photonToPlace } from '../lib/osm.ts'

test('turns a Photon result into a place', () => {
  const place = photonToPlace({
    geometry: { coordinates: [-79.64, 43.65] },
    properties: {
      osm_type: 'N',
      osm_id: 123,
      osm_key: 'amenity',
      osm_value: 'restaurant',
      name: 'Naan Kabob',
      housenumber: '5042',
      street: 'Satellite Dr',
      city: 'Mississauga',
      state: 'Ontario',
      postcode: 'L4W 0E3',
      country: 'Canada',
    },
  })
  assert.equal(place?.google_place_id, 'osm:N123')
  assert.equal(place?.formatted_address, '5042 Satellite Dr, Mississauga, Ontario L4W 0E3, Canada')
  assert.equal(place?.latitude, 43.65)
  assert.equal(place?.google_maps_url, 'https://www.openstreetmap.org/node/123')
  assert.equal(place?.cuisine, null)
})

test('ignores results with no name or coordinates', () => {
  assert.equal(photonToPlace({ properties: { name: 'x' }, geometry: {} }), null)
})

test('only food places count as food', () => {
  assert.equal(isFoodFeature({ osm_key: 'amenity', osm_value: 'cafe' }), true)
  assert.equal(isFoodFeature({ osm_key: 'place', osm_value: 'city' }), false)
})

test('cleans websites and cuisines', () => {
  assert.equal(cleanWebsite('naankabob.ca'), 'https://naankabob.ca/')
  assert.equal(cleanWebsite('javascript:alert(1)'), null)
  assert.equal(cuisineFromTag('afghan;kebab'), 'Afghan')
  assert.equal(cuisineFromTag(undefined), null)
})

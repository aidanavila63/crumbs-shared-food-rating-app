import test from 'node:test'
import assert from 'node:assert/strict'
import { decide, sameSpot } from '../lib/import-match.ts'

const spot = (name: string, lat = 43.65, lng = -79.38): any => ({
  google_place_id: `osm:N${name.length}`,
  name,
  formatted_address: null,
  latitude: lat,
  longitude: lng,
  cuisine: null,
  website: null,
  google_maps_url: null,
})

test('matching imported places to real restaurants', () => {
  const here = { name: 'Hana Ramen', lat: 43.6501, lng: -79.3801 }
  assert.equal(sameSpot(here, spot('Hana Ramen House')), true) // same spot, similar name
  assert.equal(sameSpot(here, spot('Hana Ramen', 43.7, -79.38)), false) // 5 km away
  assert.equal(decide(here, [spot('Pizza Place'), spot('Hana Ramen')]).state, 'matched')
  // no location in the file: one exact name = sure, several = ask
  assert.equal(decide({ name: 'Sora' }, [spot('Sora')]).state, 'matched')
  assert.equal(decide({ name: 'Sora' }, [spot('Sora'), spot('Sora', 45, -75)]).state, 'pick')
  assert.equal(decide({ name: 'Sora' }, [spot('Totally Different')]).state, 'missing')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  coordsFromUrl,
  importable,
  itemsFromCsv,
  itemsFromFile,
  itemsFromGeoJson,
  itemsFromText,
  mergeDuplicates,
  parseCsv,
  toDay,
  toFive,
} from '../lib/importers.ts'

test('csv parsing with quotes and newlines', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"\nthere'],
  ])
})

test('ratings and dates in any style', () => {
  assert.equal(toFive('4'), 4)
  assert.equal(toFive('8/10'), 4)
  assert.equal(toFive('85'), 4.5)
  assert.equal(toFive('★★★'), 3)
  assert.equal(toFive('7'), 3.5)
  assert.equal(toFive(''), null)
  assert.equal(toDay('2024-03-09T18:00:00Z'), '2024-03-09')
  assert.equal(toDay('nope'), null)
})

test('saved list export (Title, Note, URL)', () => {
  const csv =
    'Title,Note,URL,Comment\n,,,\nHana Ramen,best broth,https://www.google.com/maps/place/Hana+Ramen/data=!4m2!3m1!1s0x1:0x2!3d43.6532!4d-79.3832,\n'
  const [item] = itemsFromCsv(csv, 'Toronto eats')
  assert.equal(item.name, 'Hana Ramen')
  assert.equal(item.notes, 'best broth')
  assert.equal(item.lat, 43.6532)
  assert.equal(item.list, 'Toronto eats')
})

test('a spreadsheet with its own columns', () => {
  const csv =
    'Restaurant,City,My rating,Visited,Comments\nSora,Toronto,9/10,2025-06-01,great\nKumo,Ottawa,,,\n'
  const [a, b] = itemsFromCsv(csv)
  assert.deepEqual(
    [a.name, a.address, a.rating, a.visited_on, a.status, a.notes],
    ['Sora', 'Toronto', 4.5, '2025-06-01', 'Been', 'great'],
  )
  assert.equal(b.status, null)
})

test('starred places and reviews (GeoJSON, two layouts)', () => {
  const reviews = {
    type: 'FeatureCollection',
    features: [
      {
        geometry: { type: 'Point', coordinates: [-79.38, 43.65] },
        properties: {
          date: '2023-05-02T01:02:03Z',
          five_star_rating_published: 5,
          review_text_published: 'Amazing gyoza',
          location: { name: 'Hana Ramen', address: '10 Queen St' },
        },
      },
      {
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          Title: 'Kumo',
          'Google Maps URL': 'http://maps.google.com/?q=45.42,-75.69',
        },
      },
    ],
  }
  const [a, b] = itemsFromGeoJson(reviews)
  assert.deepEqual(
    [a.name, a.rating, a.notes, a.visited_on, a.lat, a.status],
    ['Hana Ramen', 5, 'Amazing gyoza', '2023-05-02', 43.65, 'Been'],
  )
  assert.deepEqual([b.name, b.lat, b.lng, b.status], ['Kumo', 45.42, -75.69, null])
})

test('pasted lists', () => {
  const items = itemsFromText('1. Hana Ramen, Toronto - 4/5\n• Kumo\n\nx')
  assert.deepEqual(
    items.map((i) => [i.name, i.address, i.rating]),
    [
      ['Hana Ramen', 'Toronto', 4],
      ['Kumo', null, null],
    ],
  )
})

test('files, duplicates and what to skip', () => {
  assert.equal(
    itemsFromFile('Takeout/Saved/Date night.csv', 'Title,Note,URL\nSora,,\n')[0].list,
    'Date night',
  )
  assert.equal(coordsFromUrl('https://x/@43.1,-79.2,17z')?.lng, -79.2)
  const merged = mergeDuplicates([
    { name: 'Hana Ramen', lat: 43.65, lng: -79.38 },
    { name: 'hana ramen', lat: 43.6501, lng: -79.3801, rating: 5 },
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].rating, 5)
  assert.equal(importable('Takeout/Maps (your places)/Reviews.json'), true)
  assert.equal(importable('Takeout/Location History/Records.json'), false)
  assert.equal(importable('Takeout/Maps/photo.jpg'), false)
})

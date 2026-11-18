// U14 (Round 92): a group's places as a spreadsheet (CSV) and as a map file (KML, opens in Google
// My Maps, Google Earth and most map apps). Made on the phone from what's already loaded.
import type { Place } from '../hooks/use-crumbs-data'
import { average5 } from './ratings.ts'

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  // spreadsheets run text starting with = + - @ as a formula: keep it plain text
  // (numbers, like a negative longitude, stay numbers)
  const number = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(text)
  const safe = !number && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function placesCsv(places: Place[]) {
  const header = ['Name', 'Status', 'Cuisine', 'Price', 'Our rating', 'Ratings', 'Visits', 'Last visit',
    'Tags', 'Address', 'Latitude', 'Longitude', 'Website', 'Map link']
  const rows = places.map((p) => {
    const visits = p.place_visits ?? []
    const last = visits.map((v) => v.visited_on).sort().at(-1) ?? ''
    const avg = average5(p.place_ratings)
    return [p.name, p.status, p.cuisine ?? '', p.price_level ? '$'.repeat(p.price_level) : '',
      avg ? avg.toFixed(1) : '', p.place_ratings.length, visits.length, last, (p.tags ?? []).join('; '),
      p.formatted_address ?? '', p.latitude ?? '', p.longitude ?? '', p.website ?? '', p.google_maps_url ?? '']
  })
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function placesKml(title: string, places: Place[]) {
  const pins = places
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .map((p) => {
      const avg = average5(p.place_ratings)
      const bits = [p.status, p.cuisine, avg ? `${avg.toFixed(1)}★` : null, p.formatted_address].filter(Boolean)
      return [
        '    <Placemark>',
        `      <name>${xml(p.name)}</name>`,
        `      <description>${xml(bits.join(' · '))}</description>`,
        `      <styleUrl>#${p.status === 'Been' ? 'been' : 'try'}</styleUrl>`,
        `      <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>`,
        '    </Placemark>',
      ].join('\n')
    })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${xml(title)}</name>`,
    '    <Style id="been"><IconStyle><color>ff5b2d7b</color></IconStyle></Style>',
    '    <Style id="try"><IconStyle><color>ff3aa7e0</color></IconStyle></Style>',
    ...pins,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n')
}

export const exportName = (group: string, ext: 'csv' | 'kml', day = new Date()) =>
  `${group.replace(/[^\w -]/g, '').trim().replace(/\s+/g, '-') || 'crumbs'}-places-${day.toISOString().slice(0, 10)}.${ext}`

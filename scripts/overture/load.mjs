// Round 79: puts overture-gta-food.csv (from gta_food.py) into public.overture_places, 500 rows
// at a time, then the Admin → Overture card (or merge_overture) merges them into restaurants.
// Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/overture/load.mjs overture-gta-food.csv
// Safe to run again (rows are upserted by Overture id; already-merged rows are left as they are).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/** A CSV line → fields (handles quotes and doubled quotes). */
export function parseCsvLine(line) {
  const out = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (field += '"'), (i += 1)
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') out.push(field), (field = '')
    else field += c
  }
  out.push(field)
  return out
}

const COLUMNS = ['id', 'name', 'name_local', 'category', 'latitude', 'longitude', 'address', 'city',
  'postcode', 'phone', 'website', 'brand', 'confidence', 'release']

export function toRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const row = {}
    for (const column of COLUMNS) {
      const value = cells[header.indexOf(column)]
      row[column] = value === undefined || value === '' ? null : value
    }
    row.latitude = Number(row.latitude)
    row.longitude = Number(row.longitude)
    row.confidence = row.confidence === null ? null : Number(row.confidence)
    if (row.website && !/^https?:\/\//.test(row.website)) row.website = null
    row.name = row.name?.slice(0, 160) ?? null
    return row
  }).filter((r) => r.id && r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
}

if (process.argv[1] && process.argv[1].endsWith('load.mjs')) {
  const file = process.argv[2]
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!file || !url || !key) {
    console.error('Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/overture/load.mjs <file.csv>')
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })
  const rows = toRows(readFileSync(file, 'utf8'))
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('overture_places').upsert(rows.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    done += Math.min(500, rows.length - i)
    process.stdout.write(`\r${done} / ${rows.length}`)
  }
  console.log('\nLoaded. Now Admin → Overture → Merge (or select merge_overture(5000) in the SQL editor, until waiting is 0).')
}

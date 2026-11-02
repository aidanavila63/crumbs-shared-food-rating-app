import { test } from 'node:test'
import assert from 'node:assert/strict'

// a tiny localStorage + window for the drafts store
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
}
;(globalThis as any).window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}

test('drafts: same row replaces, apply removes, offline writes become drafts', async () => {
  const { addDraft, drafts, applyDraft, writeOrDraft } = await import('../lib/offline-drafts.ts')
  addDraft({
    label: 'a',
    table: 'place_ratings',
    op: 'upsert',
    values: { place_id: 'p', user_id: 'u', score: 3 },
  })
  addDraft({
    label: 'b',
    table: 'place_ratings',
    op: 'upsert',
    values: { place_id: 'p', user_id: 'u', score: 5 },
  })
  addDraft({
    label: 'c',
    table: 'places',
    op: 'update',
    values: { status: 'Been' },
    match: { id: 'p' },
  })
  assert.deepEqual(
    drafts().map((d) => d.label),
    ['b', 'c'],
  )
  const calls: string[] = []
  const supabase = {
    from: (t: string) => ({
      upsert: (v: any) => (calls.push(`${t}:upsert:${v.score}`), Promise.resolve({ error: null })),
      update: (v: any) => ({
        match: () => (calls.push(`${t}:update:${v.status}`), Promise.resolve({ error: null })),
      }),
    }),
  }
  for (const d of drafts()) await applyDraft(supabase, d)
  assert.deepEqual(calls, ['place_ratings:upsert:5', 'places:update:Been'])
  assert.equal(drafts().length, 0)
  const down = {
    from: () => ({
      upsert: () => Promise.resolve({ error: { message: 'TypeError: Failed to fetch' } }),
    }),
  }
  const r = await writeOrDraft(down, {
    label: 'x',
    table: 'dish_ratings',
    op: 'upsert',
    values: { dish_id: 'd' },
  })
  assert.deepEqual(r, { error: null, drafted: true })
  assert.equal(drafts().length, 1)
})

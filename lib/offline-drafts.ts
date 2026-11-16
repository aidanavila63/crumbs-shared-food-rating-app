// #166 Offline edits as drafts: with no signal, changes (ratings, notes, status, dish scores…) are
// kept on this phone. Back online, you review them and apply the ones you still want.
export type Draft = {
  id: string
  label: string
  table: string
  op: 'upsert' | 'update' | 'delete'
  values?: Record<string, unknown>
  match?: Record<string, unknown>
  at: string
}

const KEY = 'crumbs-offline-drafts'
const EVENT = 'crumbs-drafts'

export function drafts(): Draft[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function save(list: Draft[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-100)))
  } catch {}
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}
/** A later change to the same row replaces the earlier draft (so you review the final version). */
export function addDraft(d: Omit<Draft, 'id' | 'at'>) {
  const key = (x: Pick<Draft, 'table' | 'values' | 'match'>) =>
    `${x.table}:${JSON.stringify(x.match ?? pick(x.values))}`
  const k = key(d)
  save([
    ...drafts().filter((x) => key(x) !== k),
    { ...d, id: crypto.randomUUID(), at: new Date().toISOString() },
  ])
}
const pick = (v?: Record<string, unknown>) =>
  v ? Object.fromEntries(Object.entries(v).filter(([k]) => /(^id$|_id$)/.test(k))) : null
export const dropDraft = (id: string) => save(drafts().filter((d) => d.id !== id))
export function onDraftsChange(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
export const isNetworkError = (error: any) =>
  !!error &&
  /fetch|network|Failed to fetch|Load failed|NetworkError/i.test(String(error?.message ?? error))

/** Runs one draft against the database. */
export async function applyDraft(supabase: any, d: Draft) {
  let q = supabase.from(d.table)
  if (d.op === 'upsert') q = q.upsert(d.values)
  else if (d.op === 'update') q = q.update(d.values).match(d.match ?? {})
  else q = q.delete().match(d.match ?? {})
  const { error } = await q
  if (!error) dropDraft(d.id)
  return error
}

/** Try the write now; with no signal, keep it as a draft instead. */
export async function writeOrDraft(
  supabase: any,
  d: Omit<Draft, 'id' | 'at'>,
): Promise<{ error: any; drafted: boolean }> {
  if (isOffline()) {
    addDraft(d)
    return { error: null, drafted: true }
  }
  try {
    const error = await applyDraft(supabase, { ...d, id: '', at: '' })
    if (error && isNetworkError(error)) {
      addDraft(d)
      return { error: null, drafted: true }
    }
    return { error, drafted: false }
  } catch (error) {
    if (isNetworkError(error)) {
      addDraft(d)
      return { error: null, drafted: true }
    }
    return { error, drafted: false }
  }
}

// ---------- the saved copy shown while offline ----------
// E20 (Round 77): the copy lives in IndexedDB (room for a big group; localStorage holds ~5 MB per
// site and a big group's copy was silently skipped), written at most every 30 s per group.
// Small things (the list of groups) stay in localStorage. Older copies there are still read.
const DB = 'crumbs-offline'
const STORE = 'copies'
const lastSaved = new Map<string, number>()

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export function cacheGroup(groupId: string, data: Record<string, unknown>, { force = false } = {}) {
  const value = { ...data, at: new Date().toISOString() }
  if (groupId === 'groups') {
    try {
      localStorage.setItem(`crumbs-cache-${groupId}`, JSON.stringify(value))
    } catch {}
    return
  }
  if (!force && Date.now() - (lastSaved.get(groupId) ?? 0) < 30_000) return
  lastSaved.set(groupId, Date.now())
  openDb().then((db) => {
    if (!db) {
      try {
        localStorage.setItem(`crumbs-cache-${groupId}`, JSON.stringify(value))
      } catch {
        // too big for this phone's storage: skip the copy
      }
      return
    }
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, groupId)
      tx.oncomplete = () => {
        db.close()
        // the old copy in localStorage isn't needed any more (and frees room)
        try {
          localStorage.removeItem(`crumbs-cache-${groupId}`)
        } catch {}
      }
    } catch {
      db.close()
    }
  })
}

/** The saved copy (IndexedDB first, then an older localStorage copy). */
export async function readCachedGroup<T>(groupId: string): Promise<(T & { at: string }) | null> {
  const db = await openDb()
  if (db) {
    const found = await new Promise<any>((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(groupId)
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    db.close()
    if (found) return found
  }
  return cachedGroup<T>(groupId)
}

export function cachedGroup<T>(groupId: string): (T & { at: string }) | null {
  try {
    return JSON.parse(localStorage.getItem(`crumbs-cache-${groupId}`) ?? 'null')
  } catch {
    return null
  }
}

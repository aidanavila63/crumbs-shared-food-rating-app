'use client'
// #87 Import from other apps: a maps app's data export (saved lists, starred places, your
// reviews), any spreadsheet saved as CSV, or a pasted list. Files are read on the phone; each
// place is matched to a real restaurant (Crumbs' own list first, then open map data — free),
// then you tick what to add. Ratings, notes, visit dates and list names come along.
import { useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { toast } from 'sonner'
import type { List, Place } from '@/hooks/use-crumbs-data'
import type { FoundSpot } from '@/lib/add-found'
import {
  importable,
  itemsFromFile,
  itemsFromText,
  mergeDuplicates,
  type ImportItem,
} from '@/lib/importers'
import { matchAll, saveImports, type ImportOptions, type Match } from '@/lib/import-match'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { Switch } from './switch'

type Stage = 'choose' | 'matching' | 'review' | 'saving' | 'done'
const MAX_ITEMS = 500

async function readFiles(files: FileList): Promise<ImportItem[]> {
  const items: ImportItem[] = []
  for (const file of Array.from(files)) {
    if (/\.zip$/i.test(file.name)) {
      const { unzipSync, strFromU8 } = await import('fflate')
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (f) => importable(f.name) && f.originalSize < 20_000_000,
      })
      for (const [path, bytes] of Object.entries(entries))
        items.push(...itemsFromFile(path, strFromU8(bytes)))
    } else if (importable(file.name) || /\.txt$/i.test(file.name)) {
      items.push(...itemsFromFile(file.name, await file.text()))
    }
  }
  return items
}

const DEMO_MATCHES = (items: ImportItem[]): Match[] =>
  items.map((item, i) => {
    const spot: FoundSpot = {
      google_place_id: `osm:Ndemo${i}${item.name.length}`,
      name: item.name,
      formatted_address: item.address ?? '1 Demo Street',
      latitude: 43.65 + i * 0.002,
      longitude: -79.38 - i * 0.002,
      cuisine: null,
      website: null,
      google_maps_url: null,
    }
    return i % 5 === 3
      ? {
          item,
          state: 'pick',
          found: null,
          options: [
            spot,
            {
              ...spot,
              google_place_id: spot.google_place_id + 'b',
              formatted_address: '99 Other Ave',
            },
          ],
        }
      : i % 5 === 4
        ? { item, state: 'missing', found: null, options: [] }
        : { item, state: 'matched', found: spot, options: [spot] }
  })

export function ImportPlaces({
  supabase,
  demo,
  groupId,
  userId,
  places,
  lists,
  near,
  onImported,
}: {
  supabase: any
  demo: boolean
  groupId: string
  userId?: string
  places: Place[]
  lists: List[]
  /** where to look when a file has no locations (your Home) */
  near: { lat: number; lng: number } | null
  onImported: (added: Place[], newLists: List[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const stop = useRef(false)
  const [stage, setStage] = useState<Stage>('choose')
  const [pasted, setPasted] = useState('')
  const [items, setItems] = useState<ImportItem[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [progress, setProgress] = useState(0)
  const [chosen, setChosen] = useState<Record<number, FoundSpot | null>>({})
  const [options, setOptions] = useState<ImportOptions>({
    status: 'auto',
    ratings: true,
    lists: true,
  })
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null)

  async function start(found: ImportItem[]) {
    const list = mergeDuplicates(found).slice(0, MAX_ITEMS)
    if (!list.length) return toast('Didn’t find any places in that — see “Where do I get my file?”')
    if (found.length > MAX_ITEMS) toast(`Importing the first ${MAX_ITEMS} — do the rest after`)
    track('import_start', { items: list.length })
    setItems(list)
    setStage('matching')
    setProgress(0)
    stop.current = false
    const done = demo
      ? DEMO_MATCHES(list)
      : await matchAll(
          supabase,
          list,
          near,
          (n, so) => {
            setProgress(n)
            setMatches([...so])
          },
          () => stop.current,
        )
    setMatches(done)
    setChosen(Object.fromEntries(done.map((m, i) => [i, m.found])))
    setStage('review')
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return
    try {
      await start(await readFiles(files))
    } catch (error: any) {
      toast.error(error?.message || 'Couldn’t read that file')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const counts = useMemo(
    () => ({
      matched: matches.filter((m) => m.state === 'matched').length,
      pick: matches.filter((m) => m.state === 'pick').length,
      missing: matches.filter((m) => m.state === 'missing').length,
    }),
    [matches],
  )
  const selected = matches
    .map((m, i) => ({ item: m.item, found: chosen[i] }))
    .filter((x): x is { item: ImportItem; found: FoundSpot } => !!x.found)
  const hasRatings = items.some((i) => i.rating || i.notes)
  const hasLists = items.some((i) => i.list)

  async function save() {
    if (!userId || !selected.length) return
    setStage('saving')
    setProgress(0)
    try {
      const out = await saveImports({
        supabase,
        demo,
        groupId,
        userId,
        places,
        lists,
        chosen: selected,
        options,
        onProgress: setProgress,
      })
      haptic('success')
      track('import_done', { added: out.added.length, skipped: out.skipped })
      setResult({ added: out.added.length, skipped: out.skipped })
      onImported(out.added, out.newLists)
      setStage('done')
    } catch (error: any) {
      toast.error(error?.message || 'Import stopped — what was added stays')
      setStage('review')
    }
  }

  if (stage === 'choose')
    return (
      <div className="stagger flex flex-col gap-4">
        <section className="surface flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Bring in places you’ve saved or rated somewhere else. Your file is read on this phone;
            each place is matched to the real restaurant and you choose what to add.
          </p>
          <input
            ref={input}
            type="file"
            multiple
            accept=".zip,.csv,.json,.geojson,.txt,text/csv,application/json,application/zip"
            className="hidden"
            onChange={(event) => pick(event.target.files)}
          />
          <button className="primary" onClick={() => input.current?.click()}>
            <FileUp size={18} /> Choose a file (.zip, .csv, .json)
          </button>
          <details className="tier-ladder">
            <summary className="cursor-pointer text-sm font-semibold text-primary">
              Where do I get my file?
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
              <li>
                <strong>Google Maps:</strong> go to takeout.google.com, press “Deselect all”, tick{' '}
                <em>Saved</em> (your lists) and <em>Maps (your places)</em> (starred places and your
                reviews), then export. Choose the .zip it emails you here.
              </li>
              <li>
                <strong>A spreadsheet:</strong> save it as CSV with a <em>Name</em> column. Address,
                City, Rating, Notes and Date columns come along if you have them.
              </li>
              <li>
                <strong>Another food app:</strong> if it can export a CSV, choose that file. If not,
                copy your list and paste it below.
              </li>
            </ul>
          </details>
        </section>
        <section className="surface flex flex-col gap-2">
          <h3 className="font-serif text-xl font-bold">Or paste a list</h3>
          <textarea
            className="field min-h-28 text-sm"
            aria-label="Places to import, one a line"
            placeholder={'One place a line, e.g.\nHana Ramen, Toronto - 4/5\nTaquería Sol'}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
          <button
            className="secondary"
            disabled={!pasted.trim()}
            onClick={() => start(itemsFromText(pasted))}
          >
            Find these places
          </button>
        </section>
      </div>
    )

  if (stage === 'matching' || stage === 'saving') {
    const total = stage === 'matching' ? items.length : selected.length
    const pct = total ? Math.round((progress / total) * 100) : 0
    return (
      <section className="surface flex flex-col gap-3" aria-live="polite">
        <p className="font-semibold">
          {stage === 'matching'
            ? `Finding the restaurants… ${progress} of ${total}`
            : `Adding places… ${progress} of ${total}`}
        </p>
        <span className="owned-bar">
          <span className="bar-fill" style={{ width: `${Math.max(3, pct)}%` }} />
        </span>
        {stage === 'matching' && (
          <>
            <p className="text-xs text-muted-foreground">
              About a place a second (the free map search asks us to go gently). You can stop and
              keep what’s found so far.
            </p>
            <button
              className="secondary !min-h-10 text-sm"
              onClick={() => {
                stop.current = true
              }}
            >
              Stop here
            </button>
          </>
        )}
      </section>
    )
  }

  if (stage === 'done')
    return (
      <section className="surface flex flex-col items-center gap-2 text-center">
        <p className="font-serif text-3xl text-primary">{result?.added ?? 0}</p>
        <p className="font-semibold">places added</p>
        {!!result?.skipped && (
          <p className="text-sm text-muted-foreground">
            {result.skipped} were already in your group and were skipped.
          </p>
        )}
        <button className="secondary mt-2" onClick={() => setStage('choose')}>
          Import more
        </button>
      </section>
    )

  // review
  return (
    <div className="stagger flex flex-col gap-4">
      <section className="surface flex flex-col gap-3">
        <p className="text-sm">
          <strong>{counts.matched}</strong> found · <strong>{counts.pick}</strong> to check ·{' '}
          <strong>{counts.missing}</strong> not found
        </p>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Add them as</span>
          <div className="segmented segmented-3" role="radiogroup" aria-label="Add them as">
            <span
              className="segmented-thumb"
              aria-hidden="true"
              style={{
                transform: `translateX(${['auto', 'Want to try', 'Been'].indexOf(options.status) * 100}%)`,
              }}
            />
            {(
              [
                ['auto', 'As in the file'],
                ['Want to try', 'Want to try'],
                ['Been', 'Been'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={options.status === id}
                className={options.status === id ? 'segmented-active' : ''}
                onClick={() => setOptions({ ...options, status: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {hasRatings && (
          <div className="settings-row">
            <span className="text-sm font-semibold">Bring my ratings and notes</span>
            <Switch
              label="Bring my ratings and notes"
              checked={options.ratings}
              onChange={(on) => setOptions({ ...options, ratings: on })}
            />
          </div>
        )}
        {hasLists && (
          <div className="settings-row">
            <span className="text-sm font-semibold">Keep my lists (same names)</span>
            <Switch
              label="Keep my lists"
              checked={options.lists}
              onChange={(on) => setOptions({ ...options, lists: on })}
            />
          </div>
        )}
        <button className="primary" disabled={!selected.length || !userId} onClick={save}>
          Add {selected.length} place{selected.length === 1 ? '' : 's'}
        </button>
      </section>

      <section className="surface flex flex-col gap-1">
        {matches.map((m, i) => (
          <div key={i} className={`import-row ${m.state === 'missing' ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-2">
              {m.state !== 'missing' && (
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-[var(--primary)]"
                  aria-label={`Add ${m.item.name}`}
                  checked={!!chosen[i]}
                  onChange={(event) =>
                    setChosen({
                      ...chosen,
                      [i]: event.target.checked ? (m.found ?? m.options[0]) : null,
                    })
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-5">{m.item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.state === 'missing'
                    ? 'Not found — add it later with search'
                    : (chosen[i] ?? m.found ?? m.options[0])?.formatted_address ||
                      'Address unknown'}
                  {m.item.rating ? ` · ★${m.item.rating}` : ''}
                  {m.item.list ? ` · ${m.item.list}` : ''}
                </p>
                {m.state === 'pick' && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {m.options.map((o) => (
                      <button
                        key={o.google_place_id}
                        className={`chip chip-sm ${chosen[i]?.google_place_id === o.google_place_id ? 'chip-active' : ''}`}
                        onClick={() => setChosen({ ...chosen, [i]: o })}
                      >
                        {o.formatted_address?.split(',').slice(0, 2).join(',') || o.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

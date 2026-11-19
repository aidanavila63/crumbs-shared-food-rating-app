'use client'
// Round 89 owner tools: tap counts (O3), the table QR menu (O1), "Owner says" tags (O14),
// "we moved / new name / closed" (O7) and changing all prices at once (O5).
// The database side is supabase/migrations/20261126_round89.sql; the small rules are in
// lib/owner-tools.ts.
import { useEffect, useMemo, useState } from 'react'
import { Download, Printer, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { haptic } from '@/lib/motion'
import { siteOrigin } from '@/lib/site'
import { restaurantPath } from '@/lib/public-page'
import {
  changedPrice,
  cleanTags,
  noticeHeadline,
  readNotice,
  SUGGESTED_TAGS,
  TAP_KINDS,
  tapText,
  type OwnerTools,
} from '@/lib/owner-tools'
import type { MenuDish, MenuSection, Restaurant } from '@/lib/restaurants'
import { downloadPoster } from './owner-extras'
import { findOnOsm } from './place-search'
import { badgeSnippet } from '@/lib/site-badge'
import { menuDishes } from '@/lib/ocr-parse'
import { normalizeDesign, type MenuDesign } from '@/lib/menu-design'
import { buildTableMenu } from '@/lib/table-menu-data'
import { torontoToday } from '@/lib/holidays'
import { photoUrl } from '@/lib/photos'
import { refreshPublicPages } from '@/lib/refresh-public'
import { MenuLookStudio } from './menu-studio'
import { PhotoButton } from './photo-button'
import { dishKey } from '@/lib/restaurants'

const notReady = (error: any, fn: string) =>
  new RegExp(`${fn}|schema cache|PGRST202`, 'i').test(error?.message ?? '')

const DEMO_TOOLS: OwnerTools = {
  city: 'etobicoke',
  slug: 'lantern-pho',
  taps: {
    call: { last30: 14, before: 9 },
    directions: { last30: 41, before: 38 },
    website: { last30: 12, before: 12 },
    book: { last30: null, before: 0 },
    menu: { last30: 63, before: 50 },
    table_menu: { last30: 88, before: 0 },
  },
}

/** The owner's numbers and the page's link; null until loaded (or before the SQL has run). */
export function useOwnerTools(supabase: any, restaurantId: string, demo: boolean) {
  const [tools, setTools] = useState<OwnerTools | null>(demo ? DEMO_TOOLS : null)
  useEffect(() => {
    if (demo) return
    let live = true
    Promise.resolve(supabase.rpc('owner_tools', { target: restaurantId }))
      .then(({ data, error }: any) => {
        if (live && !error && data) setTools(data)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [supabase, restaurantId, demo])
  return tools
}

/** O3: how often people tapped Call, Directions… on your page (last 30 days). */
export function OwnerTaps({ tools }: { tools: OwnerTools | null }) {
  if (!tools) return null
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Taps on your page</h3>
      <p className="text-xs text-muted-foreground">Last 30 days. Totals only — never who.</p>
      <div className="grid grid-cols-2 gap-2">
        {TAP_KINDS.map((k) => {
          const t = tapText(tools.taps[k.id])
          return (
            <div key={k.id} className="surface-soft !p-2">
              <p className="font-serif text-xl text-primary">{t.now}</p>
              <p className="text-xs font-semibold">{k.label}</p>
              {t.trend && <p className="text-[0.7rem] text-muted-foreground">{t.trend}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** O1: a poster for the tables — scanning it opens just your menu. O15 v2 (Round 99): its look. */
export function OwnerTableQr({
  name,
  tools,
  restaurant,
  menu = [],
  sections = [],
  supabase,
  demo,
  onSaved,
}: {
  name: string
  tools: OwnerTools | null
  restaurant?: Restaurant
  menu?: MenuDish[]
  sections?: MenuSection[]
  supabase?: any
  demo?: boolean
  onSaved?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [design, setDesign] = useState<MenuDesign>(() => normalizeDesign(restaurant?.menu_design, restaurant?.menu_theme))
  const [logo, setLogo] = useState<string | null>(restaurant?.logo_path ?? null)
  const today = torontoToday()
  // the preview is drawn from your real menu, the same way diners see it
  const preview = useMemo(
    () =>
      buildTableMenu(
        {
          name,
          cuisine: restaurant?.cuisine ?? null,
          menu: menu.filter((d) => !d.hidden).map((d) => ({ name: d.name, price: d.price, course: d.course, dietary: d.dietary, description: d.description, served: d.served, menu_name: d.menu_name })),
          menu_sections: sections,
          menu_items: menu.map((d) => ({
            id: d.id, name: d.name, section: d.section_id ?? null, position: d.position ?? null, prices: d.prices ?? null, sold_out_on: d.sold_out_on ?? null,
            badges: d.badges ?? null, swatch: d.swatch ?? null, name_local: d.name_local ?? null, spice: d.spice ?? null, pairs_with: d.pairs_with ?? null,
            photo_path: d.photo_path ?? null, dietary: d.dietary,
          })),
        },
        { today, meal: null, logo: photoUrl(logo) },
      ).data,
    [name, restaurant?.cuisine, menu, sections, today, logo],
  )
  async function saveDesign(next: MenuDesign) {
    setSaving(true)
    try {
      if (!demo && restaurant) {
        const { error } = await supabase.rpc('owner_set_menu_design', { target: restaurant.id, design: next })
        if (error) throw new Error(/owner_set_menu_design|schema cache|PGRST202/i.test(error.message ?? '') ? 'The new menu designs aren’t switched on yet' : error.message)
        refreshPublicPages('restaurant')
        onSaved?.()
      }
      setDesign(next)
      haptic('success')
      toast.success('Menu look saved')
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the look')
    } finally {
      setSaving(false)
    }
  }
  async function saveLogo(path: string | null) {
    setLogo(path)
    if (demo || !restaurant) return true
    // the logo lives with the restaurant page; Round 95's call keeps it (and leaves the old look as it was)
    const { error } = await supabase.rpc('owner_set_menu_look', { target: restaurant.id, theme: restaurant.menu_theme ?? 'crumbs', logo: path })
    if (error) {
      toast.error(/owner_set_menu_look|schema cache|PGRST202/i.test(error.message ?? '') ? 'Logos aren’t switched on yet' : error.message)
      return false
    }
    refreshPublicPages('restaurant')
    onSaved?.()
    return true
  }
  if (!tools?.city || !tools.slug) return null
  const link = `${siteOrigin()}${restaurantPath(tools.city, tools.slug)}/menu`
  async function make() {
    setBusy(true)
    try {
      await downloadPoster({
        link,
        name,
        title: 'Scan for our menu',
        line1: 'Point your camera here to see the menu,',
        line2: 'today’s specials and what people love.',
        qrLabel: `QR code that opens ${name}’s menu`,
        file: 'table-menu',
      })
      haptic('success')
    } catch {
      toast.error('Could not make the poster')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="surface flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-serif text-xl font-bold">
        <QrCode size={20} /> Table QR menu
      </h3>
      <p className="text-sm text-muted-foreground">
        A QR for your tables. Scanning it opens just your menu — no app, no sign-in. Everything on it comes from the
        menu you keep above (categories, prices, sold out today); here you only pick how it looks.
      </p>
      {restaurant && (
        <MenuLookStudio
          key={restaurant.id}
          initial={design}
          data={preview}
          today={today}
          saving={saving}
          onSave={saveDesign}
          previewLink={link}
          logoSlot={
            <PhotoButton path={logo} folder={restaurant.id} supabase={supabase} demo={!!demo} label="Your logo" aspect={1} onChange={saveLogo} />
          }
        />
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {!restaurant && (
          <a className="text-sm font-semibold text-primary underline" href={link} target="_blank" rel="noopener noreferrer">
            See what diners see
          </a>
        )}
        <a className="text-sm font-semibold text-primary underline" href={`${link}/print`} target="_blank" rel="noopener noreferrer">
          <Printer size={14} className="mr-1 inline align-[-2px]" />
          Print table tents or a paper menu
        </a>
      </div>
      <button className="secondary flex items-center justify-center gap-2" disabled={busy} onClick={make}>
        <Download size={16} /> {busy ? 'Making it…' : 'Download table QR'}
      </button>
    </section>
  )
}

/** O2 (Round 92): a "Rated on Crumbs" badge for your own website, linking to your Crumbs page. */
export function OwnerSiteBadge({ name, tools }: { name: string; tools: OwnerTools | null }) {
  if (!tools?.city || !tools.slug) return null
  const path = restaurantPath(tools.city, tools.slug)
  const code = badgeSnippet(siteOrigin(), path, name)
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Badge for your website</h3>
      <p className="text-sm text-muted-foreground">
        Shows “Rated on Crumbs” with your score once 3 groups have rated you (until then, “Find us
        on Crumbs”) and links to your Crumbs page. Paste the code into your website.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${path}/badge.svg`} alt={`${name} on Crumbs`} width={220} height={56} />
      <textarea className="field font-mono text-xs" rows={4} readOnly value={code} aria-label="Badge code" />
      <button
        className="secondary"
        onClick={() =>
          navigator.clipboard
            .writeText(code)
            .then(() => toast.success('Code copied'))
            .catch(() => toast.error('Couldn’t copy — select the code and copy it'))
        }
      >
        Copy the code
      </button>
    </section>
  )
}

/** O14: short tags in your own words, shown on your page as "Owner says". */
export function OwnerTags({
  restaurant,
  supabase,
  demo,
  onSaved,
}: {
  restaurant: Restaurant
  supabase: any
  demo: boolean
  onSaved: () => void
}) {
  const saved = restaurant.owner_tags ?? []
  const [tags, setTags] = useState<string[]>(saved)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // (the parent keys this by the saved tags, so a reload starts it fresh)
  const savedKey = saved.join('|')
  const checked = cleanTags(tags)
  const dirty = checked.tags.join('|') !== savedKey
  function add(text: string) {
    const next = cleanTags([...tags, text])
    if (next.error) return toast.error(next.error)
    setTags(next.tags)
    setDraft('')
  }
  async function save() {
    if (checked.error) return toast.error(checked.error)
    if (demo) {
      toast.success('Tags saved')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('owner_set_tags', { target: restaurant.id, tags: checked.tags })
    setBusy(false)
    if (error)
      return toast.error(notReady(error, 'owner_set_tags') ? 'Tags aren’t switched on yet' : error.message)
    haptic('success')
    toast.success('Saved — they show on your page as “Owner says”')
    onSaved()
  }
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Owner says</h3>
      <p className="text-sm text-muted-foreground">
        Up to 6 short tags in your own words, shown on your page under “Owner says”. For diet and
        access details (vegan, step-free…), use Good to know instead.
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <button
            key={t}
            className="chip chip-active"
            aria-label={`Remove ${t}`}
            onClick={() => setTags(tags.filter((x) => x !== t))}
          >
            {t} ✕
          </button>
        ))}
        {!tags.length && <span className="text-sm text-muted-foreground">No tags yet</span>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.trim()) add(draft)
        }}
      >
        <input
          className="field flex-1"
          maxLength={30}
          placeholder="e.g. Since 1987"
          aria-label="New tag"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="secondary" type="submit" disabled={!draft.trim() || tags.length >= 6}>
          Add
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_TAGS.filter((s) => !tags.some((t) => t.toLowerCase() === s.trim().toLowerCase())).map((s) => (
          <button
            key={s}
            className="chip text-xs"
            disabled={tags.length >= 6}
            onClick={() => (s.endsWith(' ') ? setDraft(s) : add(s))}
          >
            + {s.trim()}
            {s.endsWith(' ') ? '…' : ''}
          </button>
        ))}
      </div>
      <button className="primary" disabled={!dirty || busy || !!checked.error} onClick={save}>
        {busy ? 'Saving…' : 'Save tags'}
      </button>
    </section>
  )
}

type Change = 'moved' | 'renamed' | 'closed'
const CHANGE_LABEL: Record<Change, string> = {
  moved: 'We moved',
  renamed: 'New name',
  closed: 'Closed for good',
}

/** O7: one place to say "we moved", "we have a new name" or "we closed" — the detail changes and
 *  a notice shows on your page (90 days, or while closed). */
export function OwnerBigChange({
  restaurant,
  supabase,
  demo,
  onSaved,
}: {
  restaurant: Restaurant
  supabase: any
  demo: boolean
  onSaved: () => void
}) {
  const [change, setChange] = useState<Change | null>(null)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const current = readNotice(restaurant.owner_notice)
  const showing =
    current && (!current.until || current.until >= new Date().toISOString().slice(0, 10)) ? current : null

  function pick(next: Change | null) {
    setChange(next)
    setValue('')
    setNote('')
    setSure(false)
  }
  async function save() {
    if (!change) return
    if (change !== 'closed' && !value.trim())
      return toast.error(change === 'moved' ? 'Type the new address' : 'Type the new name')
    if (change === 'closed' && !sure) return setSure(true)
    if (demo) {
      toast.success('Done — your page shows the notice')
      return pick(null)
    }
    setBusy(true)
    try {
      let lat: number | null = null
      let lng: number | null = null
      if (change === 'moved') {
        // put the pin on the new address if the map knows it (otherwise the address still changes)
        const found = await findOnOsm(value.trim(), null).catch(() => null)
        if (found?.latitude != null && found.longitude != null) {
          lat = found.latitude
          lng = found.longitude
        }
      }
      const { error } = await supabase.rpc('owner_big_change', {
        target: restaurant.id,
        change,
        new_value: change === 'closed' ? null : value.trim(),
        note: note.trim() || null,
        lat,
        lng,
      })
      if (error)
        throw new Error(notReady(error, 'owner_big_change') ? 'This isn’t switched on yet' : error.message)
      haptic('success')
      toast.success(
        change === 'moved' && lat === null
          ? 'Address changed. We couldn’t place it on the map yet — members’ map checks will fix the pin.'
          : 'Done — your page shows the notice',
      )
      pick(null)
      onSaved()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    } finally {
      setBusy(false)
    }
  }
  async function takeDown() {
    if (demo) return toast.success('Notice taken down')
    const { error } = await supabase.rpc('owner_big_change', { target: restaurant.id, change: 'clear' })
    if (error) return toast.error(error.message)
    toast.success('Notice taken down')
    onSaved()
  }

  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Big change?</h3>
      {showing && (
        <div className="surface-soft flex flex-col gap-1 text-sm">
          <p>
            <strong>Showing now:</strong>{' '}
            {noticeHeadline(showing, restaurant.name, restaurant.formatted_address)}
          </p>
          {showing.text && <p>“{showing.text}”</p>}
          <button className="self-start text-xs font-semibold text-primary underline" onClick={takeDown}>
            Take the notice down
          </button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Changes the detail for everyone and puts a notice on your page. A new name keeps the old one
        under “Also known as”, so people still find you.
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CHANGE_LABEL) as Change[]).map((c) => (
          <button
            key={c}
            className={`chip ${change === c ? 'chip-active' : ''}`}
            aria-pressed={change === c}
            onClick={() => pick(change === c ? null : c)}
          >
            {CHANGE_LABEL[c]}
          </button>
        ))}
      </div>
      {change && (
        <div className="flex flex-col gap-2">
          {change !== 'closed' && (
            <input
              className="field"
              maxLength={change === 'moved' ? 300 : 160}
              aria-label={change === 'moved' ? 'New address' : 'New name'}
              placeholder={change === 'moved' ? 'New address' : 'New name'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
          <textarea
            className="field"
            rows={2}
            maxLength={200}
            aria-label="A note for your page (optional)"
            placeholder={
              change === 'closed'
                ? 'A note for your page (optional) — e.g. Thank you for 12 great years'
                : 'A note for your page (optional)'
            }
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {change === 'closed' && sure && (
            <p className="text-sm font-semibold text-destructive">
              Your page will say {restaurant.name} has closed for good. Tap again to confirm.
            </p>
          )}
          <div className="flex gap-2">
            <button className="secondary flex-1" onClick={() => pick(null)}>
              Cancel
            </button>
            <button
              className={`${change === 'closed' ? 'secondary text-destructive' : 'primary'} flex-1`}
              disabled={busy}
              onClick={save}
            >
              {busy ? 'Saving…' : change === 'closed' ? (sure ? 'Yes, we’ve closed' : 'We’ve closed') : 'Save'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const COURSE_CHOICES: { id: string; label: string }[] = [
  { id: '', label: 'Everything' },
  { id: 'starter', label: 'Starters' },
  { id: 'main', label: 'Mains' },
  { id: 'side', label: 'Sides' },
  { id: 'dessert', label: 'Desserts' },
  { id: 'drink', label: 'Drinks' },
]

/** O5: change all prices (or one course's) by a percentage, rounded to 5 cents. */
export function OwnerPriceChange({
  restaurantId,
  menu,
  supabase,
  demo,
  onMenu,
  onChanged,
}: {
  restaurantId: string
  menu: MenuDish[]
  supabase: any
  demo: boolean
  onMenu: (menu: MenuDish[]) => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pct, setPct] = useState('')
  const [course, setCourse] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(pct)
  const valid = pct.trim() !== '' && Number.isFinite(n) && n !== 0 && n >= -50 && n <= 100
  const affected = menu.filter(
    (d) => !d.hidden && d.price !== null && Number(d.price) > 0 && (!course || d.course === course),
  )
  async function apply() {
    if (!valid || !affected.length) return
    if (demo) {
      onMenu(
        menu.map((d) =>
          affected.some((a) => a.id === d.id) ? { ...d, price: changedPrice(Number(d.price), n) } : d,
        ),
      )
      toast.success(`${affected.length} prices changed`)
      setOpen(false)
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('owner_bulk_price', {
      target: restaurantId,
      pct: n,
      only_course: course || null,
    })
    setBusy(false)
    if (error)
      return toast.error(notReady(error, 'owner_bulk_price') ? 'This isn’t switched on yet' : error.message)
    haptic('success')
    toast.success(`${data ?? affected.length} prices changed`)
    setOpen(false)
    setPct('')
    onChanged()
  }
  if (!menu.some((d) => d.price !== null)) return null
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Change prices</h3>
      {!open ? (
        <>
          <p className="text-sm text-muted-foreground">
            Raise or lower every price at once (or one course), rounded to 5 cents.
          </p>
          <button className="secondary" onClick={() => setOpen(true)}>
            Change all prices…
          </button>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              By (%)
              <input
                className="field"
                inputMode="decimal"
                placeholder="e.g. 5 or -10"
                value={pct}
                onChange={(event) => setPct(event.target.value.replace(/[^\d.-]/g, ''))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Which
              <select className="field" value={course} onChange={(event) => setCourse(event.target.value)}>
                {COURSE_CHOICES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {pct.trim() !== '' && !valid && (
            <p className="text-xs text-destructive">Pick a change between -50% and +100%</p>
          )}
          {valid && (
            <ul className="text-sm">
              {affected.slice(0, 3).map((d) => (
                <li key={d.id}>
                  {d.name}: ${Number(d.price).toFixed(2)} → <strong>${changedPrice(Number(d.price), n).toFixed(2)}</strong>
                </li>
              ))}
              {affected.length > 3 && (
                <li className="text-muted-foreground">…and {affected.length - 3} more</li>
              )}
              {!affected.length && <li className="text-muted-foreground">No priced dishes there</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <button className="secondary flex-1" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary flex-1" disabled={!valid || !affected.length || busy} onClick={apply}>
              {busy ? 'Changing…' : `Change ${affected.length} price${affected.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** O5 (Round 95): paste a price list ("Steak frites 32" a line) — prices change on dishes already on
 *  your menu, new ones are added. */
export function OwnerPastePrices({
  restaurantId,
  menu,
  supabase,
  demo,
  onChanged,
}: {
  restaurantId: string
  menu: MenuDish[]
  supabase: any
  demo: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const lines = text.trim() ? menuDishes(text) : []
  const known = new Map(menu.map((d) => [dishKey(d.name), d]))
  const changes = lines.filter((l) => known.has(dishKey(l.name)))
  const fresh = lines.filter((l) => !known.has(dishKey(l.name)))
  async function apply() {
    if (!lines.length) return
    if (demo) return toast('Not available in demo mode')
    setBusy(true)
    const { data, error } = await supabase.rpc('owner_paste_prices', {
      target: restaurantId,
      items: lines.slice(0, 150).map((l) => ({ name: l.name, price: l.price === null ? null : String(l.price) })),
    })
    setBusy(false)
    if (error)
      return toast.error(/owner_paste_prices|schema cache|PGRST202/i.test(error.message ?? '') ? 'This isn’t switched on yet' : error.message)
    haptic('success')
    toast.success(`${data?.changed ?? changes.length} prices updated, ${data?.added ?? fresh.length} dishes added`)
    setText('')
    setOpen(false)
    onChanged()
  }
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Paste a price list</h3>
      {!open ? (
        <>
          <p className="text-sm text-muted-foreground">
            One dish a line with its price (from your till, a spreadsheet or your website). Dishes already on your
            menu get the new price; the rest are added.
          </p>
          <button className="secondary" onClick={() => setOpen(true)}>
            Paste a list…
          </button>
        </>
      ) : (
        <>
          <textarea
            className="field"
            rows={6}
            aria-label="Price list"
            placeholder={'Steak frites 32\nOnion soup ........ 12.50\nCrème brûlée $9'}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {lines.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Read {lines.length} line{lines.length === 1 ? '' : 's'}: {changes.length} price
              {changes.length === 1 ? '' : 's'} to update, {fresh.length} new dish{fresh.length === 1 ? '' : 'es'}.
            </p>
          )}
          <div className="flex gap-2">
            <button className="secondary flex-1" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary flex-1" disabled={!lines.length || busy} onClick={apply}>
              {busy ? 'Saving…' : 'Save prices'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

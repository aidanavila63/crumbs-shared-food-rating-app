'use client'
// The owner's menu (#100, Round 97's served-at / menus / seasons), now with Round 99's categories:
// the owner makes their own (Pizza, Pasta, Flavours of the day…), puts them and their dishes in
// order, and sets how each is shown on the table menu (⚙: sizes in columns, colour swatches,
// add-ons…). Each dish can carry size prices, badges, diets, a colour, its name in the
// restaurant's own language, spice, "pairs with" and a photo — and one tap marks it sold out
// for today. Everything on the table menu comes from here; the Look studio only picks the look.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { dishKey, ownerEditDish, shareDishes, sortMenu, type MenuDish, type MenuSection } from '@/lib/restaurants'
import { BADGES, DIET_FILTERS, EFFECTS, normalizeDisplay, normHex, type SectionDisplay } from '@/lib/menu-design'
import { torontoToday } from '@/lib/holidays'
import { refreshPublicPages } from '@/lib/refresh-public'
import { menuDishes } from '@/lib/ocr-parse'
import { haptic } from '@/lib/motion'
import { ReadPhotoButton } from './photo-reader'
import { PhotoButton } from './photo-button'
import { CategorySettings } from './menu-studio'

const SERVED = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'late', label: 'Late night' },
]
const COURSES: { id: MenuDish['course']; label: string }[] = [
  { id: 'starter', label: 'Starter' },
  { id: 'main', label: 'Main' },
  { id: 'side', label: 'Side' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'drink', label: 'Drink' },
]
const effectLabel = (id: string) => EFFECTS.find((e) => e[0] === id)?.[1] ?? 'Standard list'
const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`)
const readPrice = (text: string) => {
  const n = Number(text.replace(/[^0-9.]/g, ''))
  return text.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const notOnYet = (message: string, what = 'Menu categories') =>
  /owner_dish_look|owner_menu|owner_dish_sold_out|restaurant_menu_sections|schema cache|PGRST202|PGRST205/i.test(message) ? `${what} aren’t switched on yet` : message

type Draft = {
  name: string
  price: string
  sizes: string[]
  course: MenuDish['course']
  served: string[]
  menu: string
  from: string
  to: string
  section: string | null
  badges: string[]
  diet: string[]
  swatch: string | null
  local: string
  spice: number
  pairs: string
  photo: string | null
}

export function OwnerMenu({
  restaurantId,
  menu,
  sections,
  supabase,
  demo,
  onMenu,
  onSections,
  onChanged,
}: {
  restaurantId: string
  menu: MenuDish[]
  sections: MenuSection[]
  supabase: any
  demo: boolean
  onMenu: (menu: MenuDish[]) => void
  onSections: (sections: MenuSection[]) => void
  onChanged: () => Promise<void>
}) {
  const [edit, setEdit] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [catDraft, setCatDraft] = useState<{ name: string; local: string; display: SectionDisplay } | null>(null)
  const [newCat, setNewCat] = useState('')
  const [adding, setAdding] = useState<{ name: string; price: string; section: string | null }>({ name: '', price: '', section: null })
  const today = torontoToday()

  const ordered = useMemo(() => [...sections].sort((a, b) => a.position - b.position), [sections])
  const byPos = (a: MenuDish, b: MenuDish) => (a.position ?? 1e4) - (b.position ?? 1e4) || a.name.localeCompare(b.name)
  const inSection = (id: string | null) =>
    (id ? menu.filter((d) => d.section_id === id) : menu.filter((d) => !d.section_id || !sections.some((s) => s.id === d.section_id))).sort(id ? byPos : () => 0)
  const sectionOf = (id: string | null | undefined) => sections.find((s) => s.id === id) ?? null
  const sizesOf = (id: string | null | undefined) => {
    const s = sectionOf(id)
    return s ? normalizeDisplay(s.display).sizes : []
  }

  async function rpc(name: string, args: Record<string, unknown>, what?: string) {
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw new Error(notOnYet(error.message ?? '', what))
    return data
  }
  const done = async (message?: string) => {
    if (!demo) {
      await onChanged()
      refreshPublicPages('restaurant')
    }
    haptic('success')
    if (message) toast.success(message)
  }

  // ---------- categories ----------
  async function saveCategory(id: string | null, name: string, local: string, display: SectionDisplay) {
    try {
      if (!name.trim()) return
      if (demo) {
        if (id) onSections(sections.map((s) => (s.id === id ? { ...s, name: name.trim(), name_local: local.trim() || null, display } : s)))
        else onSections([...sections, { id: `demo-cat-${Date.now()}`, restaurant_id: restaurantId, name: name.trim(), name_local: null, menu_name: null, position: sections.length, display }])
      } else {
        await rpc('owner_menu_section_save', { target: restaurantId, section: id, sec_name: name.trim(), sec_local: local.trim() || null, sec_menu: null, disp: display })
      }
      await done(id ? 'Category saved' : `Added ${name.trim()}`)
      setOpenCat(null)
      setNewCat('')
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }
  async function removeCategory(s: MenuSection) {
    try {
      if (demo) {
        onSections(sections.filter((x) => x.id !== s.id))
        onMenu(menu.map((d) => (d.section_id === s.id ? { ...d, section_id: null } : d)))
      } else await rpc('owner_menu_section_remove', { section: s.id })
      await done(`Removed ${s.name}. Its dishes are back under their course.`)
      setOpenCat(null)
    } catch (error: any) {
      toast.error(error?.message || 'Could not remove that')
    }
  }
  async function moveCategory(i: number, by: -1 | 1) {
    const next = [...ordered]
    const j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onSections(next.map((s, k) => ({ ...s, position: k })))
    try {
      if (!demo) await rpc('owner_menu_order', { target: restaurantId, section_ids: next.map((s) => s.id), dish_ids: null })
      if (!demo) refreshPublicPages('restaurant')
    } catch (error: any) {
      toast.error(error?.message || 'Could not move that')
    }
  }
  async function moveDish(list: MenuDish[], i: number, by: -1 | 1) {
    const next = [...list]
    const j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    const pos = new Map(next.map((d, k) => [d.id, k]))
    onMenu(menu.map((d) => (pos.has(d.id) ? { ...d, position: pos.get(d.id)! } : d)))
    try {
      if (!demo) await rpc('owner_menu_order', { target: restaurantId, section_ids: null, dish_ids: next.map((d) => d.id) })
      if (!demo) refreshPublicPages('restaurant')
    } catch (error: any) {
      toast.error(error?.message || 'Could not move that')
    }
  }

  // ---------- dishes ----------
  async function soldOut(dish: MenuDish) {
    const now = dish.sold_out_on === today
    try {
      if (!demo) await rpc('owner_dish_sold_out', { target_dish: dish.id, sold: !now }, '“Sold out today”')
      onMenu(menu.map((d) => (d.id === dish.id ? { ...d, sold_out_on: now ? null : today } : d)))
      if (!demo) refreshPublicPages('restaurant')
      haptic('success')
      toast.success(now ? `${dish.name} is back on` : `${dish.name}: sold out for today`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not do that')
    }
  }
  function startEdit(dish: MenuDish) {
    const sizes = sizesOf(dish.section_id)
    setDraft({
      name: dish.name,
      price: dish.price === null ? '' : String(dish.price),
      sizes: sizes.length >= 2 ? sizes.map((_, i) => (dish.prices?.[i] ?? (i === 0 ? dish.price : null))?.toString() ?? '') : [],
      course: dish.course,
      served: dish.served ?? [],
      menu: dish.menu_name ?? '',
      from: dish.season_from ?? '',
      to: dish.season_to ?? '',
      section: dish.section_id ?? null,
      badges: dish.badges ?? [],
      diet: dish.dietary ?? [],
      swatch: dish.swatch ?? null,
      local: dish.name_local ?? '',
      spice: dish.spice ?? 0,
      pairs: dish.pairs_with ?? '',
      photo: dish.photo_path ?? null,
    })
    setEdit(dish.id)
  }
  async function save(dish: MenuDish, d: Draft) {
    const sizes = sizesOf(d.section)
    const sizePrices = sizes.length >= 2 ? d.sizes.slice(0, sizes.length).map(readPrice) : []
    const multi = sizePrices.length >= 2 && sizePrices.every((p) => p !== null)
    if (sizes.length >= 2 && sizePrices.some((p) => p !== null) && !multi) return toast.error('Add a price for every size (or none)')
    const price = multi ? (sizePrices[0] as number) : readPrice(d.price)
    try {
      if (demo) {
        onMenu(sortMenu(menu.map((x) => (x.id === dish.id ? {
          ...x, name: d.name.trim(), price, course: d.course, owner_ok: true, hidden: false,
          served: d.served.length ? d.served : null, menu_name: d.menu.trim() || null, season_from: d.from || null, season_to: d.to || null,
          section_id: d.section, prices: multi ? (sizePrices as number[]) : null, badges: d.badges.length ? d.badges : null, dietary: d.diet,
          swatch: d.swatch, name_local: d.local.trim() || null, spice: d.spice || null, pairs_with: d.pairs.trim() || null, photo_path: d.photo,
        } : x))))
      } else {
        await ownerEditDish(supabase, dish.id, { name: d.name.trim(), price, course: d.course })
        if (d.served.join() !== (dish.served ?? []).join() || d.menu.trim() !== (dish.menu_name ?? '') || d.from !== (dish.season_from ?? '') || d.to !== (dish.season_to ?? ''))
          await rpc('owner_dish_extras', { target_dish: dish.id, served_at: d.served.length ? d.served : null, menu: d.menu.trim() || null, from_day: d.from || null, to_day: d.to || null }, 'Menus and seasons')
        await rpc('owner_dish_look', {
          target_dish: dish.id, section: d.section, size_prices: multi ? sizePrices : null, dish_badges: d.badges.length ? d.badges : null,
          dish_diet: d.diet, dish_swatch: d.swatch, local: d.local.trim() || null, dish_spice: d.spice || null, pairs: d.pairs.trim() || null, photo: d.photo,
        }, 'Table menu details')
      }
      await done('Saved')
      setEdit(null)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }
  async function remove(dish: MenuDish) {
    try {
      if (demo) onMenu(menu.filter((d) => d.id !== dish.id))
      else await ownerEditDish(supabase, dish.id, 'remove')
      await done(`Removed ${dish.name}`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not remove that')
    }
  }
  async function add(dishes: { name: string; price?: number | null }[], how: 'photo' | 'manual', section: string | null = null) {
    if (!dishes.length) return
    try {
      if (demo) {
        onMenu(sortMenu([...menu, ...dishes.map((d, i) => ({
          id: `demo-owned-new-${Date.now()}-${i}`, restaurant_id: restaurantId, name: d.name, name_key: dishKey(d.name), price: d.price ?? null,
          description: null, course: null, dietary: [], source: how, owner_ok: true, confirms: 0, flags: 0,
          price_checked_at: new Date().toISOString(), section_id: section,
        }))]))
      } else {
        await shareDishes(supabase, restaurantId, dishes, how)
        // put a dish added under a category straight into it
        if (section && dishes.length === 1) {
          const { data } = await supabase.from('restaurant_dishes').select('id').eq('restaurant_id', restaurantId).eq('name_key', dishKey(dishes[0].name)).maybeSingle()
          if (data?.id)
            await rpc('owner_dish_look', { target_dish: data.id, section, size_prices: null, dish_badges: null, dish_diet: null, dish_swatch: null, local: null, dish_spice: null, pairs: null, photo: null })
        }
      }
      await done(`Added ${dishes.length} dish${dishes.length === 1 ? '' : 'es'}`)
      setAdding({ name: '', price: '', section: null })
    } catch (error: any) {
      toast.error(error?.message || 'Could not add that')
    }
  }

  const editor = (dish: MenuDish, d: Draft) => {
    const sizes = sizesOf(d.section)
    const effect = sectionOf(d.section) ? normalizeDisplay(sectionOf(d.section)!.display).effect : 'list'
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch })
    const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
    return (
      <div key={dish.id} className="rise-panel flex flex-col gap-2 rounded-2xl bg-[var(--card)] p-3">
        <input className="field !min-h-10 text-sm" aria-label="Dish name" maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Category
          <select className="field !min-h-10 text-sm" value={d.section ?? ''} onChange={(e) => {
            const next = e.target.value || null
            const s = sizesOf(next)
            set({ section: next, sizes: s.length >= 2 ? s.map((_, i) => d.sizes[i] ?? (i === 0 ? d.price : '')) : [] })
          }}>
            <option value="">None (shown by course)</option>
            {ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {sizes.length >= 2 ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}>
            {sizes.map((label, i) => (
              <label key={label + i} className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                {label}
                <input className="field !min-h-10 text-sm" inputMode="decimal" placeholder="$" value={d.sizes[i] ?? ''}
                  onChange={(e) => { const next = [...d.sizes]; next[i] = e.target.value; set({ sizes: next }) }} />
              </label>
            ))}
          </div>
        ) : (
          <input className="field !min-h-10 text-sm" aria-label="Price" inputMode="decimal" placeholder={effect === 'addons' ? 'Extra cost, e.g. 1.50' : 'Price'} value={d.price} onChange={(e) => set({ price: e.target.value })} />
        )}
        <div className="chip-row" aria-label="Course">
          {COURSES.map((c) => (
            <button key={c.id} type="button" aria-pressed={d.course === c.id} className={`chip chip-sm ${d.course === c.id ? 'chip-active' : ''}`} onClick={() => set({ course: d.course === c.id ? null : c.id })}>{c.label}</button>
          ))}
        </div>
        <div className="chip-row" aria-label="Diet">
          {DIET_FILTERS.map((t) => (
            <button key={t} type="button" aria-pressed={d.diet.includes(t)} className={`chip chip-sm ${d.diet.includes(t) ? 'chip-active' : ''}`} onClick={() => set({ diet: toggle(d.diet, t) })}>{t}</button>
          ))}
        </div>
        <div className="chip-row" aria-label="Badges">
          {BADGES.map((t) => (
            <button key={t} type="button" aria-pressed={d.badges.includes(t)} className={`chip chip-sm ${d.badges.includes(t) ? 'chip-active' : ''}`} onClick={() => set({ badges: toggle(d.badges, t) })}>{t}</button>
          ))}
        </div>
        <details className="text-sm" open={['swatches', 'chips', 'photos'].includes(effect) || !!d.local || !!d.spice || !!d.pairs || undefined}>
          <summary className="cursor-pointer font-semibold">More for the table menu</summary>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">Colour</span>
              <input type="color" aria-label="Dish colour (for colour swatches)" value={d.swatch ?? '#E8B27A'} onChange={(e) => set({ swatch: normHex(e.target.value) })} className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-card p-0" />
              {d.swatch ? <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => set({ swatch: null })}>No colour</button> : <span className="text-xs text-muted-foreground">Used by colour swatches and chips</span>}
            </div>
            <label className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">Own language</span>
              <input className="field !min-h-10 min-w-0 flex-1 text-sm" maxLength={120} placeholder="e.g. 唐揚げ" value={d.local} onChange={(e) => set({ local: e.target.value })} />
            </label>
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Spice">
              <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">Spice</span>
              {[0, 1, 2, 3].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={d.spice === n} className={`chip chip-sm ${d.spice === n ? 'chip-active' : ''}`} onClick={() => set({ spice: n })}>{n === 0 ? 'None' : '🌶'.repeat(n)}</button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">Pairs with</span>
              <input className="field !min-h-10 min-w-0 flex-1 text-sm" maxLength={80} placeholder="e.g. our house red" value={d.pairs} onChange={(e) => set({ pairs: e.target.value })} />
            </label>
            <PhotoButton path={d.photo} folder={restaurantId} supabase={supabase} demo={demo} label="Dish photo (for photo cards)" aspect={4 / 3} compact onChange={(path) => { set({ photo: path }); return true }} />
          </div>
        </details>
        <details className="text-sm" open={!!(d.served.length || d.menu || d.from || d.to) || undefined}>
          <summary className="cursor-pointer font-semibold">When it’s served, which menu, seasonal</summary>
          <div className="mt-2 flex flex-col gap-2">
            <div className="chip-row" aria-label="Served at">
              {SERVED.map((t) => (
                <button key={t.id} type="button" aria-pressed={d.served.includes(t.id)} className={`chip chip-sm ${d.served.includes(t.id) ? 'chip-active' : ''}`} onClick={() => set({ served: toggle(d.served, t.id) })}>{t.label}</button>
              ))}
            </div>
            <input className="field !min-h-10 text-sm" aria-label="Which menu" list="owner-menu-names" maxLength={30} placeholder="Menu: blank = main (or Brunch, Drinks…)" value={d.menu} onChange={(e) => set({ menu: e.target.value })} />
            <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">Seasonal from
                <input className="field !min-h-10 w-full min-w-0 text-sm" type="date" value={d.from} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">until
                <input className="field !min-h-10 w-full min-w-0 text-sm" type="date" min={d.from || undefined} value={d.to} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </div>
          </div>
        </details>
        <div className="flex gap-2">
          <button type="button" className="secondary !min-h-10 text-sm" onClick={() => setEdit(null)}>Cancel</button>
          <button type="button" className="primary !min-h-10 flex-1 text-sm" disabled={!d.name.trim()} onClick={() => save(dish, d)}>Save</button>
        </div>
      </div>
    )
  }

  const row = (dish: MenuDish, list: MenuDish[], i: number, movable: boolean) => {
    if (edit === dish.id && draft) return editor(dish, draft)
    const sold = dish.sold_out_on === today
    const prices = dish.prices?.length ? dish.prices.map(money).join(' / ') : money(dish.price)
    const extras = [...(dish.dietary ?? []), ...(dish.badges ?? []), dish.spice ? '🌶'.repeat(dish.spice) : ''].filter(Boolean).join(' · ')
    return (
      <div key={dish.id} className="menu-row flex items-center gap-1.5 py-1.5">
        {movable && (
          <span className="flex flex-col">
            <button type="button" className="icon-btn !h-6 !w-7" aria-label={`Move ${dish.name} up`} disabled={i === 0} onClick={() => moveDish(list, i, -1)}><ArrowUp size={13} /></button>
            <button type="button" className="icon-btn !h-6 !w-7" aria-label={`Move ${dish.name} down`} disabled={i === list.length - 1} onClick={() => moveDish(list, i, 1)}><ArrowDown size={13} /></button>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-5">
            {dish.swatch && <span aria-hidden="true" className="mr-1.5 inline-block size-3 rounded-full align-[-1px]" style={{ background: dish.swatch }} />}
            <span className={sold ? 'line-through opacity-60' : ''}>{dish.name}</span>
            {prices && <span className="ml-2 font-normal text-muted-foreground">{prices}</span>}
          </p>
          {dish.hidden ? (
            <p className="text-xs font-semibold text-primary">Members say this isn’t on the menu any more — fix it or remove it</p>
          ) : extras ? (
            <p className="text-xs text-muted-foreground">{extras}</p>
          ) : !dish.owner_ok ? (
            <p className="text-xs text-muted-foreground">Added by members</p>
          ) : null}
          <button type="button" aria-pressed={sold} onClick={() => soldOut(dish)}
            className={`mt-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${sold ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
            {sold ? 'Sold out today · tap to undo' : 'Sold out today?'}
          </button>
        </div>
        <button type="button" className="icon-btn !h-9 !w-9" aria-label={`Edit ${dish.name}`} onClick={() => startEdit(dish)}><Pencil size={15} /></button>
        <button type="button" className="icon-btn !h-9 !w-9" aria-label={`Remove ${dish.name}`} onClick={() => remove(dish)}><Trash2 size={15} /></button>
      </div>
    )
  }

  const addForm = (section: string | null, label: string) => {
    const mine = adding.section === section
    return (
      <form className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] gap-2" onSubmit={(e) => {
        e.preventDefault()
        if (!mine || !adding.name.trim()) return
        add([{ name: adding.name.trim(), price: readPrice(adding.price) }], 'manual', section)
      }}>
        <input className="field !min-h-10 text-sm" aria-label={label} placeholder={label} maxLength={120} value={mine ? adding.name : ''}
          onChange={(e) => setAdding({ section, name: e.target.value, price: mine ? adding.price : '' })} />
        <input className="field !min-h-10 text-sm" aria-label={`${label}: price`} inputMode="decimal" placeholder="$" value={mine ? adding.price : ''}
          onChange={(e) => setAdding({ section, name: mine ? adding.name : '', price: e.target.value })} />
        <button className="secondary !min-h-10 shrink-0 text-sm" disabled={!mine || !adding.name.trim()}>Add</button>
      </form>
    )
  }

  const loose = inSection(null)
  return (
    <section className="surface flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl font-bold">Menu</h3>
        <span className="text-xs text-muted-foreground">{menu.length} dishes</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Your table menu shows your categories in this order. Tap <Settings2 size={13} className="inline align-[-2px]" aria-label="settings" /> to choose how
        each one is shown, and “Sold out today?” when something runs out. It comes back by itself tomorrow.
      </p>
      <ReadPhotoButton label="Snap your menu" className="primary !min-h-10 text-sm" onText={(text) => {
        const found = menuDishes(text)
        if (!found.length) return toast('Couldn’t read dishes there — try a closer photo')
        add(found, 'photo')
      }} />
      <datalist id="owner-menu-names">
        {[...new Set(menu.map((d) => d.menu_name).filter(Boolean))].map((n) => <option key={n} value={n!} />)}
      </datalist>

      {ordered.map((s, i) => {
        const display = normalizeDisplay(s.display)
        const list = inSection(s.id)
        const open = openCat === s.id
        return (
          <div key={s.id} className="flex flex-col gap-1 rounded-2xl border border-border p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="flex flex-col">
                <button type="button" className="icon-btn !h-6 !w-7" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => moveCategory(i, -1)}><ArrowUp size={13} /></button>
                <button type="button" className="icon-btn !h-6 !w-7" aria-label={`Move ${s.name} down`} disabled={i === ordered.length - 1} onClick={() => moveCategory(i, 1)}><ArrowDown size={13} /></button>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-5">{s.name}{s.name_local && <span className="ml-1.5 font-normal text-muted-foreground">{s.name_local}</span>}</p>
                <p className="text-xs text-muted-foreground">{effectLabel(display.effect)}{display.sizes.length ? ` · ${display.sizes.join(', ')}` : ''} · {list.length} dish{list.length === 1 ? '' : 'es'}</p>
              </div>
              <button type="button" aria-expanded={open} aria-label={`Settings for ${s.name}`} className={`icon-btn !h-10 !w-10 ${open ? '!bg-primary !text-primary-foreground' : ''}`}
                onClick={() => { setOpenCat(open ? null : s.id); setCatDraft({ name: s.name, local: s.name_local ?? '', display }) }}>
                <Settings2 size={18} />
              </button>
            </div>
            {open && catDraft && (
              <div className="rise-panel flex flex-col gap-2.5 rounded-xl bg-[var(--card)] p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-sm font-semibold">Name
                    <input className="field" maxLength={40} value={catDraft.name} onChange={(e) => setCatDraft({ ...catDraft, name: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">In your language
                    <input className="field" maxLength={40} placeholder="optional" value={catDraft.local} onChange={(e) => setCatDraft({ ...catDraft, local: e.target.value })} />
                  </label>
                </div>
                <CategorySettings value={catDraft.display} hasSizes={list.some((d) => (d.prices?.length ?? 0) > 1)} onChange={(display) => setCatDraft({ ...catDraft, display })} />
                <div className="flex gap-2">
                  <button type="button" className="secondary !min-h-10 text-sm" onClick={() => removeCategory(s)}>Remove category</button>
                  <button type="button" className="primary !min-h-10 flex-1 text-sm" disabled={!catDraft.name.trim()} onClick={() => saveCategory(s.id, catDraft.name, catDraft.local, catDraft.display)}>Save</button>
                </div>
              </div>
            )}
            {list.map((d, k) => row(d, list, k, true))}
            {addForm(s.id, 'Add a dish here')}
          </div>
        )
      })}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); saveCategory(null, newCat, '', { effect: 'list', sizes: [], show_prices: true, note: '', label: '' }) }}>
        <input className="field !min-h-10 min-w-0 flex-1 text-sm" aria-label="New category" placeholder="New category (Pizza, Flavours…)" maxLength={40} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button className="secondary !min-h-10 shrink-0 text-sm" disabled={!newCat.trim()}><Plus size={15} className="mr-1 inline" />Category</button>
      </form>

      {(loose.length > 0 || !ordered.length) && (
        <div className="flex flex-col gap-1">
          {ordered.length > 0 && <p className="text-sm font-bold">Not in a category yet <span className="font-normal text-muted-foreground">(shown by course)</span></p>}
          {loose.map((d, k) => row(d, loose, k, false))}
          {addForm(null, 'Add a dish')}
        </div>
      )}
    </section>
  )
}

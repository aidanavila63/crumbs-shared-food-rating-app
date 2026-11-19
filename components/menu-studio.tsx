// O15 v2 (Round 99): the owner's "Look" studio for the table menu (steps 1–5 with a live
// preview of their real menu), and the per-category settings used in the menu editor.
// Only the look is chosen here; the menu itself comes from what the owner keeps in Crumbs.
'use client'
import { useMemo, useState } from 'react'
import { Check, Settings2 } from 'lucide-react'
import { FRAMES } from '@/lib/menu-art'
import {
  BACKGROUNDS, EFFECTS, LAYOUTS, LOGO_POS, PAIRINGS, SCHEMES, STYLES, SEASON_LABEL,
  type EffectId, type MenuDesign, type SectionDisplay, artColour, bgCss, frameById, normHex, pairingFont, resolveLook, seasonFor, styleById,
} from '@/lib/menu-design'
import { menuFont } from '@/lib/menu-fonts'
import { MenuView, type MenuViewData } from './menu-view'
import { Switch } from './switch'

const NIGHT_TIMES = [null, '19:00', '20:00', '21:00', '22:00', '23:00'] as const
const nightLabel = (v: string | null) => (v ? `${Number(v.slice(0, 2)) - 12} pm` : 'Off')

function Choice({ on, onClick, children, className = '', label }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] px-2.5 py-1.5 text-left text-sm font-semibold transition-colors ${
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
      } ${className}`}
    >
      {children}
    </button>
  )
}

function Swatch4({ colours }: { colours: string[] }) {
  return (
    <span aria-hidden="true" className="grid flex-none grid-cols-2 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ width: 18, height: 18 }}>
      {colours.map((c, i) => <span key={i} style={{ background: c }} />)}
    </span>
  )
}

export function MenuLookStudio({
  initial,
  data,
  today,
  saving,
  onSave,
  previewLink,
  logoSlot,
}: {
  initial: MenuDesign
  /** the owner's real menu, for the preview */
  data: MenuViewData
  /** YYYY-MM-DD in Toronto, to preview this season's decoration */
  today: string
  saving?: boolean
  onSave: (d: MenuDesign) => void
  previewLink?: string
  /** the logo upload button (it lives on the restaurant page settings) */
  logoSlot?: React.ReactNode
}) {
  const [d, setD] = useState<MenuDesign>(initial)
  const [group, setGroup] = useState<'cuisine' | 'shop'>(styleById(initial.style)?.group ?? 'cuisine')
  const [nightPreview, setNightPreview] = useState(false)
  const [bgTab, setBgTab] = useState<'frames' | 'patterns'>(initial.frame ? 'frames' : 'patterns')
  const set = (patch: Partial<MenuDesign>) => setD((x) => ({ ...x, ...patch }))
  const look = useMemo(() => resolveLook(d, { night: nightPreview }), [d, nightPreview])
  const style = styleById(d.style) ?? STYLES[0]
  const season = seasonFor(today, d)
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const t = look.theme

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="flex flex-col gap-4">
        {/* 1. Look */}
        <section className="flex flex-col gap-3" aria-labelledby="look-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id="look-1" className="font-bold">1. Look</h4>
            <div className="segmented" role="radiogroup" aria-label="Kind of look" style={{ minWidth: 280 }}>
              <span className="segmented-thumb" aria-hidden="true" style={{ transform: d.mode === 'custom' ? 'translateX(100%)' : 'none' }} />
              <button type="button" role="radio" aria-checked={d.mode === 'style'} className={d.mode === 'style' ? 'segmented-active' : ''} onClick={() => set({ mode: 'style', font: 'style', layout: null })}>Ready-made</button>
              <button type="button" role="radio" aria-checked={d.mode === 'custom'} className={d.mode === 'custom' ? 'segmented-active' : ''} onClick={() => set({ mode: 'custom', font: d.font === 'style' ? 'classic' : d.font, layout: null })}>Build your own</button>
            </div>
          </div>
          {d.mode === 'style' ? (
            <>
              <p className="text-sm text-muted-foreground">Each style has its own artwork and three sets of colours made for it.</p>
              <div className="flex gap-4 border-b border-border" role="tablist">
                {(['cuisine', 'shop'] as const).map((g) => (
                  <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)}
                    className={`-mb-px border-b-2 px-1 pb-1.5 text-sm font-bold ${group === g ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
                    {g === 'cuisine' ? 'Cuisines' : 'Kinds of place'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {STYLES.filter((s) => s.group === group).map((s) => (
                  <Choice key={s.id} on={d.style === s.id} onClick={() => set({ style: s.id, way: 0, layout: null, font: 'style' })}>
                    <Swatch4 colours={[s.ways[0].P, s.ways[0].O, s.ways[0].S, s.ways[0].A]} />
                    <span className="leading-tight">{s.label}</span>
                  </Choice>
                ))}
              </div>
              <p className="text-sm"><strong>{style.label}:</strong> <span className="text-muted-foreground">{style.note}</span></p>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Colours">
                {style.ways.map((w, i) => (
                  <Choice key={w.name} on={d.way === i} onClick={() => set({ way: i })}>
                    <Swatch4 colours={[w.P, w.O, w.S, w.A]} />
                    <span className="leading-tight">{w.name}</span>
                  </Choice>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Background</p>
                <div className="flex gap-4" role="tablist" aria-label="Kind of background">
                  {([['frames', 'Full designs'], ['patterns', 'Patterns']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={bgTab === k} onClick={() => setBgTab(k)}
                      className={`border-b-2 pb-1 text-sm font-bold ${bgTab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{label}</button>
                  ))}
                </div>
              </div>
              {bgTab === 'frames' ? (
                <>
                  <p className="text-sm text-muted-foreground">A whole design for the page: frame, corners, a crest over your name and dividers. It stretches to fit your menu.</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    <button type="button" aria-pressed={!d.frame} onClick={() => set({ frame: null })} className="flex flex-col items-center gap-1 text-xs font-semibold">
                      <span aria-hidden="true" className="flex h-20 w-full items-center justify-center rounded-lg text-muted-foreground" style={{ background: bgCss(d.bg, ...d.colours), boxShadow: !d.frame ? '0 0 0 3px var(--primary)' : 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}>None</span>
                      No frame
                    </button>
                    {FRAMES.map((f) => {
                      const [P, S, A] = d.colours
                      const C = { P, S, A, O: A, O2: P, X: A, Y: P, G: P, ink: P, neon: false }
                      const thumb = f.corner ?? f.crest ?? f.top ?? f.bottom ?? f.side
                      return (
                        <button key={f.id} type="button" aria-pressed={d.frame === f.id} onClick={() => set({ frame: f.id })} className="flex flex-col items-center gap-1 text-center text-xs font-semibold">
                          <span aria-hidden="true" className="relative block h-20 w-full overflow-hidden rounded-lg" style={{ background: S, boxShadow: d.frame === f.id ? '0 0 0 3px var(--primary)' : 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}>
                            <span className="absolute inset-1.5 rounded-[4px]" style={{ border: `1px solid ${P}` }} />
                            {thumb && (
                              <svg viewBox={typeof thumb.v === 'number' ? `0 0 ${thumb.v} ${thumb.v}` : thumb.v} className="absolute left-1 top-1 h-[70%] w-[70%]" preserveAspectRatio="xMinYMin meet">
                                {thumb.p.map((p, i) => <path key={i} d={p.d} fill={artColour(p.f, C)} stroke={artColour(p.s, C)} strokeWidth={p.w || 0} opacity={p.o ?? 1} fillRule={p.r === 'evenodd' ? 'evenodd' : 'nonzero'} />)}
                              </svg>
                            )}
                          </span>
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                  {d.frame && (
                    <button type="button" className="chip chip-sm self-start" onClick={() => { const f = frameById(d.frame)!; set({ colours: f.scheme, font: 'style' }) }}>
                      Use the colours and fonts it was drawn with
                    </button>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {BACKGROUNDS.map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={d.bg === id} onClick={() => set({ bg: id })} className="flex flex-col items-center gap-1 text-xs font-semibold">
                      <span aria-hidden="true" className="h-11 w-full rounded-lg" style={{ background: bgCss(id, ...d.colours), boxShadow: d.bg === id ? '0 0 0 3px var(--primary), inset 0 0 0 1px rgba(0,0,0,0.1)' : 'inset 0 0 0 1px rgba(0,0,0,0.1)' }} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {(['Primary', 'Secondary', 'Accent'] as const).map((label, i) => (
                  <label key={label} className="flex flex-col gap-1 rounded-xl bg-muted p-2.5 text-sm font-bold">
                    {label}
                    <span className="flex items-center gap-2">
                      <input type="color" value={d.colours[i]} onChange={(e) => {
                        const v = normHex(e.target.value)
                        if (v) { const c = [...d.colours] as MenuDesign['colours']; c[i] = v; set({ colours: c }) }
                      }} className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-card p-0" />
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{d.colours[i]}</span>
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">{['Headings, bars, header', 'The background', 'Prices, lines, highlights'][i]}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SCHEMES.map(([name, a, b, c]) => (
                  <button key={name} type="button" className="chip chip-sm" onClick={() => set({ colours: [a, b, c] })}>
                    <Swatch4 colours={[a, c, b, a]} /> {name}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* 2. Fonts */}
        <section className="flex flex-col gap-2" aria-labelledby="look-2">
          <h4 id="look-2" className="font-bold">2. Fonts</h4>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {d.mode === 'style' && (
              <Choice on={d.font === 'style'} onClick={() => set({ font: 'style' })} className="flex-col items-start gap-0">
                <span style={{ fontFamily: menuFont(style.font.hf), fontSize: 17, lineHeight: 1.15 }}>{style.label}</span>
                <span className="text-[11px] opacity-80">Style’s own</span>
              </Choice>
            )}
            {d.mode === 'custom' && d.frame && (
              <Choice on={d.font === 'style'} onClick={() => set({ font: 'style' })} className="flex-col items-start gap-0">
                <span style={{ fontFamily: menuFont(pairingFont(frameById(d.frame)?.font ?? 'classic')?.hf ?? 'playfair'), fontSize: 17, lineHeight: 1.15 }}>{frameById(d.frame)?.label}</span>
                <span className="text-[11px] opacity-80">Design’s own</span>
              </Choice>
            )}
            {PAIRINGS.map((p) => (
              <Choice key={p[0]} on={d.font === p[0]} onClick={() => set({ font: p[0] })} className="flex-col items-start gap-0">
                <span style={{ fontFamily: menuFont(p[2]), fontWeight: Number(p[4]), textTransform: p[6] as React.CSSProperties['textTransform'], fontSize: 17, lineHeight: 1.15 }}>Menu</span>
                <span className="text-[11px] opacity-80">{p[1]}</span>
              </Choice>
            ))}
          </div>
        </section>

        {/* 3. Layout */}
        <section className="flex flex-col gap-2" aria-labelledby="look-3">
          <h4 id="look-3" className="font-bold">3. Layout</h4>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
            {LAYOUTS.map(([id, label, note]) => (
              <Choice key={id} on={look.layout === id} onClick={() => set({ layout: id })} className="flex-col items-start gap-0">
                <span>{label}</span>
                <span className="text-[11px] font-normal leading-tight opacity-80">{note}</span>
              </Choice>
            ))}
          </div>
        </section>

        {/* 4. Categories */}
        <section className="flex flex-col gap-1" aria-labelledby="look-4">
          <h4 id="look-4" className="font-bold">4. Categories</h4>
          <p className="text-sm text-muted-foreground">
            Each category on your menu can be shown its own way: sizes in columns for pizza, colour swatches for flavours, add-ons for extras and more.
            Tap <Settings2 size={14} className="inline align-[-2px]" aria-label="settings" /> next to a category in your menu below.
          </p>
        </section>

        {/* 5. Logo */}
        <section className="flex flex-col gap-2" aria-labelledby="look-5">
          <h4 id="look-5" className="font-bold">5. Logo</h4>
          {logoSlot}
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label="Where your logo goes">
            {LOGO_POS.map(([k, label]) => (
              <Choice key={k} on={d.logo === k} onClick={() => set({ logo: k })} className="justify-center text-center">{label}</Choice>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            White plate behind the logo
            <Switch checked={d.plate} onChange={(v) => set({ plate: v })} label="White plate behind the logo" />
          </label>
        </section>

        {/* extras */}
        <section className="flex flex-col gap-2.5" aria-labelledby="look-6">
          <h4 id="look-6" className="font-bold">Extras</h4>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Today’s specials on top <span className="block text-xs text-muted-foreground">Your posts, styled to match</span></span>
            <Switch checked={d.specials} onChange={(v) => set({ specials: v })} label="Today’s specials on top" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>“Loved on Crumbs” hearts <span className="block text-xs text-muted-foreground">On dishes 3 or more groups love</span></span>
            <Switch checked={d.loved} onChange={(v) => set({ loved: v })} label="Loved on Crumbs hearts" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Holiday decorations <span className="block text-xs text-muted-foreground">Christmas, Halloween, Valentine’s, Lunar New Year, Diwali{season ? ` · showing: ${SEASON_LABEL[season]}` : ''}</span></span>
            <Switch checked={d.seasonal} onChange={(v) => set({ seasonal: v })} label="Holiday decorations" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Patio lights in summer <span className="block text-xs text-muted-foreground">May 15 to September 15</span></span>
            <Switch checked={d.patio} onChange={(v) => set({ patio: v })} label="Patio lights in summer" />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span>Night mode <span className="block text-xs text-muted-foreground">Darker colours from this time until 5 am, so the menu isn’t blinding in a dim room</span></span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Night mode starts">
              {NIGHT_TIMES.map((v) => (
                <button key={v ?? 'off'} type="button" role="radio" aria-checked={d.night === v} className={`chip chip-sm ${d.night === v ? 'chip-active' : ''}`} onClick={() => { set({ night: v }); setNightPreview(!!v) }}>
                  {nightLabel(v)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="primary" disabled={!dirty || saving} onClick={() => onSave(d)}>
            {saving ? 'Saving…' : dirty ? 'Save look' : 'Saved'}
          </button>
          {dirty && <button type="button" className="secondary" onClick={() => setD(initial)}>Undo changes</button>}
          {previewLink && <a className="text-sm font-semibold text-primary underline" href={previewLink} target="_blank" rel="noopener noreferrer">See what diners see</a>}
        </div>
      </div>

      {/* preview */}
      <div className="flex flex-col gap-2 lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-bold">Preview</span>
          {d.night && (
            <label className="flex items-center gap-2 text-xs font-semibold">
              Night
              <Switch checked={nightPreview} onChange={setNightPreview} label="Preview night mode" />
            </label>
          )}
        </div>
        <div className="overflow-hidden rounded-[28px] border-[10px] border-[#1C1C1E] shadow-lg">
          <MenuView data={data} design={d} look={look} season={season} height="640px" />
        </div>
        <ul className="flex flex-col gap-1 text-xs">
          {[
            ['Dish names', t.crText, false],
            ['Headings', t.crHead, t.headChanged],
            ['Prices', t.crPrice, t.priceChanged],
          ].map(([label, ratio, changed]) => (
            <li key={label as string} className="flex items-center justify-between gap-2">
              <span>{label as string}{changed ? ' (a shade adjusted so it’s readable)' : ''}</span>
              <span className="flex items-center gap-1 font-bold tabular-nums text-[#1E6B3C] dark:text-[#7BD49B]"><Check size={13} aria-hidden="true" />{(ratio as number).toFixed(1)} : 1</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** The settings panel next to a category in the owner's menu editor. */
export function CategorySettings({
  value,
  onChange,
  hasSizes,
}: {
  value: SectionDisplay
  onChange: (v: SectionDisplay) => void
  /** some dishes in this category have more than one price */
  hasSizes: boolean
}) {
  const v = value
  const set = (patch: Partial<SectionDisplay>) => onChange({ ...v, ...patch })
  const [sizesText, setSizesText] = useState(v.sizes.join(', '))
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="How this category is shown">
        {EFFECTS.map(([id, label, note]) => (
          <Choice key={id} on={v.effect === id} onClick={() => set({ effect: id as EffectId })} className="flex-col items-start gap-0">
            <span>{label}</span>
            <span className="text-[11px] font-normal leading-tight opacity-80">{note}</span>
          </Choice>
        ))}
      </div>
      {(v.effect === 'sizes' || v.effect === 'ladder' || hasSizes) && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {v.effect === 'ladder' ? 'Step labels (e.g. 1, 2, 3)' : 'Size names (e.g. 10", 14", 18" or Half, Pint)'}
          <input className="field" value={sizesText} maxLength={70} onChange={(e) => setSizesText(e.target.value)}
            onBlur={() => set({ sizes: sizesText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4) })} />
          <span className="text-xs font-normal text-muted-foreground">Separate with commas. Each dish gets one price per size.</span>
        </label>
      )}
      {(v.effect === 'swatches' || v.effect === 'photos') && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Show prices on the tiles
          <Switch checked={v.show_prices} onChange={(on) => set({ show_prices: on })} label="Show prices on the tiles" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {v.effect === 'courses' ? 'Price line (e.g. Five courses · 145 per guest)' : 'Note under the name (optional)'}
        <input className="field" value={v.note} maxLength={120} placeholder={v.effect === 'courses' ? '' : 'Changes every day'} onChange={(e) => set({ note: e.target.value })} />
      </label>
      {v.effect === 'featured' && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Label on the highlight
          <input className="field" value={v.label} maxLength={40} placeholder="House favourite" onChange={(e) => set({ label: e.target.value })} />
        </label>
      )}
    </div>
  )
}

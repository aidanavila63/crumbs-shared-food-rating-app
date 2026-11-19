// O15 v2 (Round 99): draws a table menu from the restaurant's own data (categories, dishes,
// prices, sold out, badges) in the owner's chosen look. Used by the table menu page, the owner's
// "Look" studio preview and the printable menu. Everything is inline styles so any of the
// looks can be combined with any layout and any category setting.
'use client'
import type React from 'react'
import {
  type ArtPiece, type Colours, type LayoutId, type MenuDesign, type MenuFrame, type MenuTheme, type ResolvedLook, type Season,
  type MenuItemView, type MenuSectionView, type MenuViewData,
  artColour, mix, onColour, priceLabel, resolveLook, seasonFor, woodCss,
} from '@/lib/menu-design'
import { STYLE_ART, SEASON_ART } from '@/lib/menu-art'
import { menuFont, MONO } from '@/lib/menu-fonts'

export type { MenuItemView, MenuSectionView, MenuLogo, MenuViewData } from '@/lib/menu-design'

export type DinerOptions = { diet?: string | null; local?: boolean }

const AUTO = 'auto'

function Art({ piece, C, width, height, viewBox, preserve, style }: {
  piece: ArtPiece | null | undefined; C: Colours; width: number | string; height: number | string; viewBox: string; preserve?: string; style?: React.CSSProperties
}) {
  if (!piece) return null
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={viewBox} preserveAspectRatio={preserve} style={style}>
      {piece.p.map((p, i) => (
        <path key={i} d={p.d} fill={artColour(p.f, C)} stroke={artColour(p.s, C)} strokeWidth={p.w || 0} opacity={p.o ?? 1}
          fillRule={p.r === 'evenodd' ? 'evenodd' : 'nonzero'} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

function Chili({ n, colour }: { n: number; colour: string }) {
  if (!n) return null
  return (
    <span role="img" aria-label={`Spice ${n} of 3`} style={{ display: 'inline-flex', gap: 1, alignSelf: 'center' }}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width="11" height="13" viewBox="0 0 11 13" aria-hidden="true" style={{ opacity: i < n ? 1 : 0.22 }}>
          <path d="M5.5 3C8.6 3 9.6 7.5 6.2 12.2C5.9 12.6 5.4 12.6 5.2 12.2C2.2 7.6 2.7 3 5.5 3Z" fill={colour} />
          <path d="M5.5 3C5.5 1.6 6.3 0.8 7.6 0.8" stroke="#3E7C3A" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
      ))}
    </span>
  )
}

function Heart({ colour }: { colour: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 10.6C2.4 8.2 0.8 6.2 0.8 4.2C0.8 2.6 2 1.4 3.5 1.4C4.6 1.4 5.4 2 6 2.9C6.6 2 7.4 1.4 8.5 1.4C10 1.4 11.2 2.6 11.2 4.2C11.2 6.2 9.6 8.2 6 10.6Z" fill={colour} />
    </svg>
  )
}

const vb = (p: ArtPiece, fallback: string) => (typeof p.v === 'number' ? `0 0 ${p.v} ${p.v}` : p.v ?? fallback)

/** O15 v2: a full-page design's lines and ornaments, laid over the page and stretched to its height. */
function FrameLayer({ frame, C, t, wide = false }: { frame: MenuFrame; C: Colours; t: MenuTheme; wide?: boolean }) {
  // on a page wider than a phone (print), artwork bands keep their own size instead of being cropped
  const Cf: Colours = { ...C, P: t.head, A: t.accent3 }
  const col = (k: string) => (k === 'A' ? t.accent3 : t.head)
  const out: React.ReactNode[] = []
  frame.rules.forEach((r, i) => {
    const border = `${r.w}px ${r.style} ${col(r.key)}`
    if (r.box) {
      out.push(<div key={`b${i}`} style={{ position: 'absolute', inset: r.off, border, borderRadius: r.radius, transform: r.tilt ? `rotate(${r.tilt}deg)` : undefined }} />)
      return
    }
    const g = r.off + r.gap
    out.push(<div key={`t${i}`} style={{ position: 'absolute', top: r.off, left: g, right: g, borderTop: border }} />)
    out.push(<div key={`u${i}`} style={{ position: 'absolute', bottom: r.off, left: g, right: g, borderBottom: border }} />)
    out.push(<div key={`l${i}`} style={{ position: 'absolute', left: r.off, top: g, bottom: g, borderLeft: border }} />)
    out.push(<div key={`r${i}`} style={{ position: 'absolute', right: r.off, top: g, bottom: g, borderRight: border }} />)
  })
  if (frame.corner) {
    const size = frame.csize ?? 60, at = frame.cin ?? 0
    const all: [string, React.CSSProperties, string][] = [
      ['tl', { left: at, top: at }, 'none'], ['tr', { right: at, top: at }, 'scaleX(-1)'],
      ['bl', { left: at, bottom: at }, 'scaleY(-1)'], ['br', { right: at, bottom: at }, 'scale(-1, -1)'],
    ]
    const pick = { all: ['tl', 'tr', 'bl', 'br'], diag: ['tr', 'bl'], 'tl-br': ['tl', 'br'], tr: ['tr'], bottom: ['bl', 'br'] }[frame.corners ?? 'all']
    for (const [k, pos, tr] of all)
      if (pick.includes(k)) out.push(<Art key={k} piece={frame.corner} C={Cf} width={size} height={size} viewBox={vb(frame.corner, '0 0 60 60')} style={{ position: 'absolute', ...pos, transform: tr }} />)
  }
  if (frame.mids) {
    out.push(<Art key="ml" piece={frame.mids} C={Cf} width={60} height={28} viewBox={vb(frame.mids, '0 0 60 28')} style={{ position: 'absolute', left: (frame.rules[0]?.off ?? 12) - 14, top: '50%', transform: 'translateY(-50%) rotate(-90deg)' }} />)
    out.push(<Art key="mr" piece={frame.mids} C={Cf} width={60} height={28} viewBox={vb(frame.mids, '0 0 60 28')} style={{ position: 'absolute', right: (frame.rules[0]?.off ?? 12) - 14, top: '50%', transform: 'translateY(-50%) rotate(90deg)' }} />)
  }
  if (frame.top) out.push(<Art key="top" piece={frame.top} C={Cf} width="100%" height={frame.top.size ?? 90} viewBox={vb(frame.top, '0 0 390 90')} preserve={wide ? 'xMidYMin meet' : 'xMidYMin slice'} style={{ position: 'absolute', left: 0, top: 0 }} />)
  if (frame.bottom) out.push(<Art key="bottom" piece={frame.bottom} C={Cf} width="100%" height={frame.bottom.size ?? 110} viewBox={vb(frame.bottom, '0 0 390 110')} preserve={wide ? 'xMidYMax meet' : 'xMidYMax slice'} style={{ position: 'absolute', left: 0, bottom: 0 }} />)
  if (frame.side) out.push(<Art key="side" piece={frame.side} C={Cf} width={frame.side.size ?? 70} height="100%" viewBox={vb(frame.side, '0 0 70 2400')} preserve="xMinYMin slice" style={{ position: 'absolute', left: 0, top: 0 }} />)
  return <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>{out}</div>
}

const shapes: Record<string, string> = { circle: '50%', square: '22%', shield: '14px 14px 50% 50% / 14px 14px 42% 42%', oval: '50%', ring: '50%' }

/** Which seasonal decoration (if any) shows today. */
export function menuSeason(design: MenuDesign, today: string): Season | null {
  return seasonFor(today, design)
}

export function MenuView({
  data, design, look: lookIn, night = false, season = null, diner = {}, height = AUTO, bare = false, onlySection = -1, photoUrl, tent, wide = false,
}: {
  data: MenuViewData
  design: MenuDesign
  look?: ResolvedLook
  night?: boolean
  season?: Season | null
  diner?: DinerOptions
  height?: string
  /** just the categories, no header or footer (owner's category preview) */
  bare?: boolean
  onlySection?: number
  photoUrl?: (path: string | null | undefined) => string | null
  /** the printable table tent: shown in place of the categories */
  tent?: React.ReactNode
  /** print: as wide as the page instead of a phone */
  wide?: boolean
}) {
  const look = lookIn ?? resolveLook(design, { night })
  const { theme: t, colours: C, style: st } = look
  const layout: LayoutId = look.layout
  const hf = menuFont(look.font.hf), bf = menuFont(look.font.bf)
  const hw = look.font.hw, hi = look.font.it ? 'italic' : 'normal', htt = look.font.tt ?? 'none', hls = look.font.ls ?? '0'
  const art = st ? STYLE_ART[st.id] : null
  const frame = st ? null : look.frame
  const Cf: Colours = { ...C, P: t.head, A: t.accent3 }
  const P = C.P, S = C.S, A = C.A
  const isBoard = layout === 'board', isPaper = layout === 'paper', isReceipt = layout === 'receipt', hero = layout === 'poster'

  // ---- frame
  let fr: { bg: string; pad: string; radius: string; shadow: string } = { bg: S, pad: '0', radius: '0', shadow: 'none' }
  if (st?.frame === 'gingham') fr = { bg: `repeating-linear-gradient(0deg, ${P}80 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, ${P}80 0 8px, transparent 8px 16px), #FFFFFF`, pad: '12px', radius: '4px', shadow: '0 0 0 1px rgba(0,0,0,0.08)' }
  else if (st?.frame === 'gold') fr = { bg: `linear-gradient(135deg, ${artColour('Od', C)}, ${C.O}, ${artColour('Ol', C)}, ${C.O}, ${artColour('Od', C)})`, pad: '6px', radius: '2px', shadow: 'none' }
  if (isBoard && !st?.frame) fr = { bg: woodCss(mix(P, '#3B2416', st ? 0.6 : 0.55)), pad: '12px', radius: '8px', shadow: 'inset 0 0 0 2px rgba(0,0,0,0.25), inset 0 0 40px rgba(0,0,0,0.35)' }
  if (isReceipt) fr = { bg: mix(S, t.dark ? '#FFFFFF' : '#000000', 0.12), pad: '14px 12px', radius: '0', shadow: '0 4px 14px rgba(0,0,0,0.18)' }

  // ---- layout table
  const L = ({
    classic: { align: 'center', head: 'rules', row: 'leaders', size: 34 },
    list: { align: 'left', head: 'under', row: 'plain', size: 34 },
    framed: { align: 'center', head: 'caps', row: 'centred', size: 40 },
    blocks: { align: 'left', head: 'bar', row: 'pill', size: 34 },
    cards: { align: 'left', head: 'plain', row: 'plain', size: 34 },
    poster: { align: 'center', head: 'line', row: 'plain', size: 38 },
    minimal: { align: 'left', head: 'tiny', row: 'airy', size: 32 },
    tabs: { align: 'left', head: 'plain', row: 'plain', size: 32 },
    magazine: { align: 'left', head: 'num', row: 'ruled', size: 40 },
    receipt: { align: 'center', head: 'receipt', row: 'mono', size: 28 },
    timeline: { align: 'left', head: 'under', row: 'timeline', size: 34 },
    board: { align: 'center', head: 'chalk', row: 'plain', size: 40 },
    ribbon: { align: 'center', head: 'ribbon', row: 'leaders', size: 36 },
    paper: { align: 'center', head: 'rules', row: 'leaders', size: 32 },
    side: { align: 'left', head: 'vside', row: 'plain', size: 34 },
  } as const)[layout]
  const centred = L.align === 'center'
  const alignFlex = centred ? 'center' : 'flex-start'
  const rk = L.row

  // ---- header tokens
  const hasTop = !!art?.top && (art.top.h ?? 0) > 0
  const showBand = !st && !frame && !hero && !isBoard && !isReceipt
  let lp = design.logo
  const logo = data.logo
  if (!logo || (!logo.img && !logo.text)) lp = 'none'
  if (lp === 'band' && !(showBand || hasTop)) lp = 'top'
  const titleStyle: React.CSSProperties = {
    margin: 0, fontFamily: isReceipt ? MONO : hf, fontSize: L.size, fontWeight: layout === 'minimal' ? 400 : (hw as React.CSSProperties['fontWeight']),
    fontStyle: hi, letterSpacing: hls, lineHeight: 1.08, textTransform: (layout === 'blocks' ? 'uppercase' : htt) as React.CSSProperties['textTransform'],
    color: hero ? t.onP : layout === 'minimal' ? t.ink : t.head,
  }
  if (st?.title === 'gold' && !hero) Object.assign(titleStyle, { background: `linear-gradient(180deg, ${artColour('Ol', C)} 0%, ${C.O} 55%, ${artColour('Od', C)} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' })
  if (st?.title === 'neon' && C.neon) Object.assign(titleStyle, { color: '#FFFFFF', textShadow: `0 0 2px ${P}, 0 0 10px ${P}, 0 0 24px ${P}` })
  if (frame?.title === 'banner' && !hero) Object.assign(titleStyle, { background: P, color: t.onP, padding: '8px 34px', clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 50%, 100% 100%, 0 100%, 14px 50%)' })
  if (st?.title === 'plaque') Object.assign(titleStyle, { background: `linear-gradient(180deg, ${artColour('Ol', C)}, ${C.O} 50%, ${artColour('Od', C)})`, color: t.dark ? C.S : C.O2, padding: '8px 18px', borderRadius: 8 })
  const sub = hero ? t.onP : t.muted

  // ---- row tokens (standard list)
  const R = {
    leaders: rk === 'leaders' || rk === 'mono',
    spacer: rk === 'plain' || rk === 'airy' || rk === 'ruled' || rk === 'timeline' || rk === 'pill',
    nameFont: rk === 'airy' || rk === 'centred' ? hf : rk === 'mono' ? MONO : bf,
    nameSize: rk === 'airy' || rk === 'centred' ? 19 : rk === 'pill' ? 15 : 16,
    nameWeight: (rk === 'airy' ? 400 : rk === 'pill' ? 800 : rk === 'centred' ? hw : 600) as React.CSSProperties['fontWeight'],
    nameTT: (rk === 'pill' || rk === 'mono' ? 'uppercase' : 'none') as React.CSSProperties['textTransform'],
    priceFont: rk === 'mono' ? MONO : isBoard ? hf : bf,
    priceSize: isBoard ? 19 : 16,
    priceWeight: (rk === 'airy' ? 400 : 700) as React.CSSProperties['fontWeight'],
    priceColor: rk === 'airy' ? t.ink : t.price,
    border: rk === 'ruled' || rk === 'pill' ? `1px solid ${t.line}` : 'none',
    pad: rk === 'ruled' || rk === 'pill' ? '0 0 12px' : rk === 'timeline' ? '0 0 6px' : '0',
    gap: rk === 'airy' ? 18 : rk === 'timeline' ? 8 : 14,
  }

  // ---- body
  const B = {
    pad: ({ classic: '10px 24px 8px', list: '8px 24px 8px', framed: '22px 18px', blocks: '8px 0', cards: '6px 14px 8px', poster: '20px 20px 8px', minimal: '14px 28px 8px', tabs: '8px 22px', magazine: '8px 24px', receipt: '6px 22px', timeline: '8px 24px', board: '6px 22px 8px', ribbon: '10px 22px', paper: '6px 22px 8px', side: '8px 20px 8px 14px' } as Record<LayoutId, string>)[layout],
    gap: ({ minimal: 34, cards: 14, blocks: 22, receipt: 22, magazine: 32 } as Partial<Record<LayoutId, number>>)[layout] ?? 28,
  }
  const inset = layout === 'blocks'
  const cards = layout === 'cards'

  const fmt = (p: (number | null)[]) => p.filter((x) => x !== null).map((x) => priceLabel(x)).join(' / ')
  const swCycle = [mix(A, S, 0.3), mix(P, S, 0.3), A, mix(P, S, 0.55), mix(A, S, 0.6)]
  const dim = (it: MenuItemView) => {
    const off = !!it.soldOut || (!!diner.diet && !(it.diet ?? []).includes(diner.diet))
    return off ? { opacity: 0.38 } : undefined
  }
  const nameOf = (it: { name: string; local?: string | null }) => (diner.local && it.local ? it.local : it.name)
  const otherName = (it: { name: string; local?: string | null }) => (diner.local && it.local ? it.name : it.local ?? null)

  const Extras = ({ it, centre = false }: { it: MenuItemView; centre?: boolean }) => {
    const loved = design.loved && (it.loved ?? 0) >= 3
    const tags = [...(it.diet ?? []), ...(it.badges ?? [])]
    if (!tags.length && !loved && !it.spice && !it.soldOut) return null
    return (
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', justifyContent: centre ? 'center' : 'flex-start' }}>
        {it.soldOut && <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: t.ink, color: t.bg }}>Sold out today</span>}
        {loved && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: t.badgeBg, color: t.badgeInk }}>
            <Heart colour={t.dark ? '#FF7A9A' : '#D6336C'} />Loved by {it.loved} groups
          </span>
        )}
        {tags.map((b) => (
          <span key={b} style={{ padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: t.badgeBg, color: t.badgeInk }}>{b}</span>
        ))}
        <Chili n={it.spice ?? 0} colour={t.dark ? '#FF6B4A' : '#C8321E'} />
      </span>
    )
  }
  const Desc = ({ it, italic = false, centre = false }: { it: MenuItemView; italic?: boolean; centre?: boolean }) => (
    <>
      {it.description && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.4, fontStyle: italic ? 'italic' : 'normal', color: t.muted, textAlign: centre ? 'center' : undefined }}>{it.description}</p>}
      {it.pairs && <p style={{ margin: 0, fontSize: 12.5, fontStyle: 'italic', color: t.muted }}>Pairs with {it.pairs}</p>}
    </>
  )

  const heading = (sec: { name: string; local?: string | null }, si: number) => {
    const name = nameOf(sec), other = otherName(sec)
    const h2: React.CSSProperties = { margin: 0, fontFamily: hf, fontWeight: hw as React.CSSProperties['fontWeight'], fontStyle: hi, textTransform: htt as React.CSSProperties['textTransform'], letterSpacing: hls, color: t.head }
    switch (L.head) {
      case 'rules':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ flex: 1, height: 2, background: t.A }} />
            <h2 style={{ ...h2, fontSize: 22, textAlign: 'center' }}>{name}</h2>
            <span aria-hidden="true" style={{ flex: 1, height: 2, background: t.A }} />
          </div>
        )
      case 'caps':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <h2 style={{ ...h2, fontSize: 24, fontVariant: 'small-caps', letterSpacing: '0.08em', textTransform: 'none', textAlign: 'center' }}>{name}</h2>
            <span aria-hidden="true" style={{ width: 44, height: 2, background: t.A }} />
          </div>
        )
      case 'bar':
        return (
          <div style={{ padding: '10px 16px', borderRadius: 8, background: t.P, color: t.onP }}>
            <h2 style={{ ...h2, fontSize: 21, color: t.onP, fontStyle: 'normal', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{name}</h2>
          </div>
        )
      case 'line':
        return (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ ...h2, fontSize: 24 }}>{name}</h2>
            {other && <span style={{ fontSize: 16, color: t.muted }}>{other}</span>}
            <span aria-hidden="true" style={{ flex: 1, height: 2, alignSelf: 'center', background: t.line }} />
          </div>
        )
      case 'tiny':
        return (
          <div style={{ paddingBottom: 8, borderBottom: `1px solid ${t.line}` }}>
            <h2 style={{ margin: 0, fontFamily: bf, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.headSmall }}>{name}</h2>
          </div>
        )
      case 'num':
        return (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, paddingBottom: 8, borderBottom: `2px solid ${t.ink}` }}>
            <span aria-hidden="true" style={{ fontFamily: hf, fontSize: 46, lineHeight: 0.82, fontWeight: 700, color: t.accent3 }}>{String(si + 1).padStart(2, '0')}</span>
            <h2 style={{ ...h2, fontSize: 22 }}>{name}</h2>
          </div>
        )
      case 'receipt':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ink, textAlign: 'center' }}>* * {name} * *</h2>
            <span aria-hidden="true" style={{ alignSelf: 'stretch', borderTop: `2px dashed ${t.line}` }} />
          </div>
        )
      case 'ribbon':
        return (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <h2 style={{ ...h2, fontSize: 19, padding: '8px 30px', background: t.P, color: t.onP, clipPath: 'polygon(0 0, 100% 0, calc(100% - 13px) 50%, 100% 100%, 0 100%, 13px 50%)' }}>{name}</h2>
          </div>
        )
      case 'vside':
        return (
          <h2 style={{ ...h2, fontSize: 20, flex: 'none', writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '2px 0 2px 8px', borderLeft: `3px solid ${t.A}`, whiteSpace: 'nowrap' }}>{name}</h2>
        )
      default: {
        const chalk = L.head === 'chalk', plain = L.head === 'plain'
        return (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: plain ? 0 : 6, borderBottom: chalk ? `2px dashed ${t.line}` : plain ? 'none' : `2px solid ${t.line}` }}>
            <h2 style={{ ...h2, fontSize: chalk ? 28 : plain ? 24 : 22, lineHeight: 1.15, color: chalk ? t.price : t.head }}>{name}</h2>
            {other && <span style={{ fontSize: 15, color: t.muted }}>{other}</span>}
          </div>
        )
      }
    }
  }

  let num = 0
  const body = (sec: MenuSectionView) => {
    const D = sec.display
    const items = sec.items
    const multi = items.some((it) => it.prices.length > 1)
    const sizes = D.sizes
    const nCols = multi ? Math.max(sizes.length, ...items.map((it) => it.prices.length)) : 1
    const colW = nCols > 3 ? 44 : 52
    const start = num
    num += items.length
    const showSizesNote = multi && D.effect !== 'sizes' && sizes.length > 0
    const note = D.note && D.effect !== 'courses'
    const priceText = (it: MenuItemView) => fmt(it.prices)
    const has = (it: MenuItemView) => it.prices.some((x) => x !== null)
    return (
      <>
        {note && <p style={{ margin: 0, fontSize: 13.5, fontStyle: 'italic', color: t.muted, textAlign: centred ? 'center' : 'left' }}>{D.note}</p>}
        {showSizesNote && <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.muted, textAlign: 'right' }}>{sizes.join(' / ')}</p>}

        {D.effect === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: R.gap }}>
            {items.map((it) => (
              <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'stretch', padding: R.pad, borderBottom: R.border, ...dim(it) }}>
                {rk === 'timeline' && (
                  <span aria-hidden="true" style={{ flex: 'none', width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 11, height: 11, marginTop: 5, borderRadius: '50%', background: t.A }} />
                    <span style={{ flex: 1, width: 2, background: t.line }} />
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: rk === 'centred' ? 'center' : 'stretch', textAlign: rk === 'centred' ? 'center' : 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: rk === 'centred' ? 'center' : 'flex-start', flexWrap: rk === 'centred' ? 'wrap' : 'nowrap' }}>
                    <span style={{ fontFamily: R.nameFont, fontSize: R.nameSize, fontWeight: R.nameWeight, textTransform: R.nameTT, letterSpacing: rk === 'pill' ? '0.02em' : 0, lineHeight: 1.25, textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                    {otherName(it) && <span style={{ fontSize: 13, color: t.muted }}>{otherName(it)}</span>}
                    {R.leaders && <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderBottom: `2px dotted ${t.line}`, transform: 'translateY(-4px)' }} />}
                    {R.spacer && <span style={{ flex: 1 }} />}
                    {has(it) && rk !== 'pill' && rk !== 'centred' && <span style={{ flex: 'none', whiteSpace: 'nowrap', fontFamily: R.priceFont, fontSize: R.priceSize, fontWeight: R.priceWeight, color: R.priceColor }}>{priceText(it)}</span>}
                    {has(it) && rk === 'pill' && <span style={{ flex: 'none', alignSelf: 'center', padding: '3px 11px', borderRadius: 999, fontSize: 14, fontWeight: 800, background: t.A, color: t.onA }}>{priceText(it)}</span>}
                  </div>
                  <Extras it={it} centre={rk === 'centred'} />
                  <Desc it={it} italic={rk === 'centred'} centre={rk === 'centred'} />
                  {has(it) && rk === 'centred' && <span style={{ fontSize: 15, fontWeight: 700, color: t.price }}>{priceText(it)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {D.effect === 'sizes' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, paddingBottom: 6, borderBottom: `2px solid ${t.A}` }}>
              <span style={{ flex: 1 }} />
              {Array.from({ length: nCols }, (_, c) => (
                <span key={c} style={{ width: colW, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700, color: t.muted }}>{multi ? (sizes[c] ?? '') : ''}</span>
              ))}
            </div>
            {items.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 0', borderBottom: `1px solid ${t.line}`, ...dim(it) }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 700, textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                    {otherName(it) && <span style={{ fontSize: 13, color: t.muted }}>{otherName(it)}</span>}
                  </div>
                  <Extras it={it} />
                  <Desc it={it} />
                </div>
                {multi && it.prices.length === 1 ? (
                  // one price in a sized category (e.g. a bowl that only comes one way): shown once, across the size columns
                  <span style={{ width: colW * nCols + 4 * (nCols - 1), flex: 'none', textAlign: 'center', fontSize: 15, fontWeight: 700, color: t.price }}>
                    {priceLabel(it.prices[0])}
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: t.muted }}>one size</span>
                  </span>
                ) : (
                  Array.from({ length: nCols }, (_, c) => {
                    const v = multi ? it.prices[c] ?? null : it.prices[0] ?? null
                    return <span key={c} style={{ width: colW, flex: 'none', textAlign: 'center', fontSize: 15, fontWeight: 700, color: t.price }}>{priceLabel(v)}</span>
                  })
                )}
              </div>
            ))}
          </div>
        )}

        {(D.effect === 'swatches' || D.effect === 'photos') && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${D.effect === 'photos' ? 2 : items.length >= 5 || !D.show_prices ? 3 : 2}, minmax(0, 1fr))`, gap: 10 }}>
            {items.map((it, i) => {
              const sw = it.swatch || swCycle[i % swCycle.length]
              const img = D.effect === 'photos' && photoUrl ? photoUrl(it.photo) : null
              return (
                <div key={it.id} style={{ borderRadius: 16, overflow: 'hidden', padding: D.effect === 'photos' ? 0 : '12px 8px 13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', background: t.surface, ...dim(it) }}>
                  {D.effect === 'photos' ? (
                    img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span aria-hidden="true" style={{ width: '100%', aspectRatio: '4 / 3', background: `radial-gradient(circle at 30% 30%, #FFFFFF55 0 18%, transparent 19%), ${sw}` }} />
                    )
                  ) : (
                    <span aria-hidden="true" style={{ width: 50, height: 50, borderRadius: '50%', border: `3px solid ${t.bg}`, boxShadow: `0 0 0 2px ${t.line}`, background: `radial-gradient(circle at 34% 30%, #FFFFFF66 0 16%, transparent 17%), ${sw}` }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: D.effect === 'photos' ? '2px 10px 12px' : 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2, textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                    {it.description && <span style={{ fontSize: 12, lineHeight: 1.3, color: t.muted }}>{it.description}</span>}
                    {it.pairs && <span style={{ fontSize: 11.5, fontStyle: 'italic', color: t.muted, textAlign: 'center' }}>Pairs with {it.pairs}</span>}
                    <Extras it={it} centre />
                    {D.show_prices && has(it) && <span style={{ fontSize: 15, fontWeight: 800, color: t.price }}>{priceText(it)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {D.effect === 'chips' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: alignFlex }}>
            {items.map((it, i) => (
              <span key={it.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 8px', borderRadius: 999, border: `1.5px solid ${t.line}`, background: t.surface, fontSize: 14, fontWeight: 600, textDecoration: it.soldOut ? 'line-through' : 'none', ...dim(it) }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', background: it.swatch || swCycle[i % swCycle.length], boxShadow: 'inset 0 0 0 1px #00000026' }} />
                {nameOf(it)}
                {D.show_prices && has(it) && !it.soldOut && <span style={{ fontWeight: 800, color: t.price }}>{priceText(it)}</span>}
                {it.soldOut && <span style={{ fontSize: 11, fontWeight: 800 }}>· sold out</span>}
              </span>
            ))}
          </div>
        )}

        {D.effect === 'ladder' && (
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))`, gap: 8, paddingTop: 2 }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: '15%', right: '15%', top: 30, height: 3, borderRadius: 2, background: t.line }} />
            {items.map((it, i) => {
              const stepBg = mix(P, S, Math.max(0, 0.6 - i * (0.6 / Math.max(1, items.length - 1))))
              return (
                <div key={it.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center', ...dim(it) }}>
                  <span style={{ width: 58, height: 58, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: hf, fontSize: 26, fontWeight: 700, background: stepBg, color: onColour(stepBg), boxShadow: `0 0 0 4px ${t.bg}` }}>{D.sizes[i] || String(i + 1)}</span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{nameOf(it)}</span>
                  {it.description && <span style={{ fontSize: 12, lineHeight: 1.3, color: t.muted }}>{it.description}</span>}
                  {it.pairs && <span style={{ fontSize: 11.5, fontStyle: 'italic', color: t.muted, textAlign: 'center' }}>Pairs with {it.pairs}</span>}
                  {has(it) && <span style={{ fontSize: 18, fontWeight: 800, color: t.price }}>{priceText(it)}</span>}
                </div>
              )
            })}
          </div>
        )}

        {D.effect === 'addons' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: alignFlex }}>
            {items.map((it) => (
              <span key={it.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, padding: '7px 12px', borderRadius: 10, border: `1.5px dashed ${t.priceLine}`, fontSize: 14, ...dim(it) }}>
                {has(it) && <strong style={{ fontWeight: 800, color: t.price }}>+{priceText(it)}</strong>}
                <span style={{ textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
              </span>
            ))}
          </div>
        )}

        {D.effect === 'numbered' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, ...dim(it) }}>
                <span style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: t.A, color: t.onA }}>{start + i + 1}</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                  {otherName(it) && <span style={{ fontSize: 14, color: t.muted }}>{otherName(it)}</span>}
                  <Extras it={it} />
                  <Desc it={it} />
                </div>
                {has(it) && <span style={{ flex: 'none', paddingTop: 4, fontSize: 16, fontWeight: 800, color: t.price }}>{priceText(it)}</span>}
              </div>
            ))}
          </div>
        )}

        {D.effect === 'featured' && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 18, padding: '15px 16px 17px', background: t.surface, border: `2px solid ${t.A}`, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', ...dim(items[0]) }}>
              <span style={{ alignSelf: 'flex-start', padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', background: t.A, color: t.onA }}>{D.label || 'House favourite'}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: hf, fontSize: 22, fontWeight: hw as React.CSSProperties['fontWeight'], fontStyle: hi, lineHeight: 1.15, textDecoration: items[0].soldOut ? 'line-through' : 'none' }}>{nameOf(items[0])}</span>
                {has(items[0]) && <span style={{ flex: 'none', fontSize: 20, fontWeight: 800, color: t.price }}>{priceText(items[0])}</span>}
              </div>
              {otherName(items[0]) && <span style={{ fontSize: 14, color: t.muted }}>{otherName(items[0])}</span>}
              <Extras it={items[0]} />
              <Desc it={items[0]} />
            </div>
            {items.slice(1).map((it) => (
              <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, ...dim(it) }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                  <span style={{ flex: 1 }} />
                  {has(it) && <span style={{ fontSize: 16, fontWeight: 700, color: t.price }}>{priceText(it)}</span>}
                </div>
                <Extras it={it} />
                <Desc it={it} />
              </div>
            ))}
          </div>
        )}

        {D.effect === 'compact' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 18, rowGap: 8 }}>
            {items.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingBottom: 6, borderBottom: `1px dotted ${t.line}`, ...dim(it) }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, textAlign: 'left', textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                {has(it) && <span style={{ fontSize: 14, fontWeight: 700, color: t.price }}>{priceText(it)}</span>}
              </div>
            ))}
          </div>
        )}

        {D.effect === 'build' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', ...dim(it) }}>
                <span style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, background: t.P, color: t.onP }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 700 }}>{nameOf(it)}</span>
                    {has(it) && <span style={{ fontSize: 15, fontWeight: 800, color: t.price }}>{priceText(it)}</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(it.description ?? '').split(/\s*[·,]\s*/).filter(Boolean).map((op) => (
                      <span key={op} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 13, background: t.surface, border: `1px solid ${t.line}` }}>{op}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {D.effect === 'courses' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, ...dim(it) }}>
                {i > 0 && <span aria-hidden="true" style={{ width: 5, height: 5, marginBottom: 9, borderRadius: '50%', background: t.A }} />}
                <span style={{ fontFamily: hf, fontSize: 21, fontWeight: hw as React.CSSProperties['fontWeight'], fontStyle: hi }}>{nameOf(it)}</span>
                {it.description && <span style={{ fontSize: 13.5, fontStyle: 'italic', color: t.muted }}>{it.description}</span>}
                {it.pairs && <span style={{ fontSize: 11.5, fontStyle: 'italic', color: t.muted }}>Pairs with {it.pairs}</span>}
                <Extras it={it} centre />
              </div>
            ))}
            {D.note && <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 700, color: t.price }}>{D.note}</p>}
          </div>
        )}

        {D.effect === 'combo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            {items.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, background: t.surface, border: `1.5px solid ${t.line}`, ...dim(it) }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.headSmall }}>Combo</span>
                  <span style={{ fontSize: 16.5, fontWeight: 800, textDecoration: it.soldOut ? 'line-through' : 'none' }}>{nameOf(it)}</span>
                  {it.description && <span style={{ fontSize: 13, color: t.muted }}>{it.description}</span>}
                  {it.pairs && <span style={{ fontSize: 11.5, fontStyle: 'italic', color: t.muted }}>Pairs with {it.pairs}</span>}
                  <Extras it={it} />
                </div>
                {has(it) && <span style={{ flex: 'none', minWidth: 60, height: 60, padding: '0 6px', boxSizing: 'border-box', borderRadius: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, background: t.A, color: t.onA }}>{priceText(it)}</span>}
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  const sections = data.sections.filter((s, i) => s.items.length > 0 && (onlySection < 0 || onlySection === i))
  const specials = !bare && design.specials ? (data.specials ?? []) : []
  const divPiece = art?.div ?? frame?.div ?? null
  const hasDiv = !!divPiece && layout !== 'side'
  const fpad = frame && !bare
    ? `${Math.round(frame.pad * 0.5 + (frame.top ? (frame.top.size ?? 0) * 0.62 : 0))}px ${Math.max(0, frame.pad - 14)}px ${Math.round(frame.pad * 0.4 + (frame.bottom?.size ?? 0))}px ${Math.max(0, (frame.padLeft ?? frame.pad) - 14)}px`
    : '0'
  const cornerTop = (hasTop ? art!.top!.h ?? 0 : 0) + 4
  const seasonArt = season ? SEASON_ART[season] : null

  const logoBox = (size: number, pad: number, fontPx: number, bgPlate?: string) => {
    if (!logo) return null
    const ring = logo.shape === 'ring'
    const radius = shapes[logo.shape ?? 'circle'] ?? '50%'
    return (
      <div style={{ width: size, height: size, flex: 'none', boxSizing: 'border-box', borderRadius: logo.img ? 14 : radius, background: bgPlate ?? (design.plate ? '#FFFFFF' : 'transparent'), padding: bgPlate || design.plate ? pad : 0, boxShadow: bgPlate || design.plate ? '0 2px 10px rgba(0,0,0,0.18)' : 'none', display: 'flex', position: 'relative' }}>
        {logo.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.img} alt={`${data.name} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius, background: ring ? 'transparent' : logo.bg ?? P, color: ring ? t.head : logo.ink ?? onColour(logo.bg ?? P), border: ring ? `3px double ${t.head}` : 'none', fontFamily: hf, fontSize: fontPx, fontWeight: 700, lineHeight: 1 }}>{logo.text}</div>
        )}
      </div>
    )
  }

  const corner = (pos: React.CSSProperties, transform: string) => (
    <Art piece={art?.corner} C={C} width={56} height={56} viewBox="0 0 60 60" style={{ position: 'absolute', ...pos, transform, pointerEvents: 'none', zIndex: 2 }} />
  )

  return (
    <div style={{ width: '100%', maxWidth: wide ? 'none' : 520, margin: '0 auto', height: height === AUTO ? undefined : height, overflowY: height === AUTO ? 'visible' : 'auto', overflowX: 'hidden', boxSizing: 'border-box', padding: fr.pad, background: fr.bg, fontFamily: bf, color: t.ink }}>
      <div style={{ position: 'relative', minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: look.bg, borderRadius: fr.radius, boxShadow: fr.shadow, overflow: 'hidden' }}>
        {isReceipt && <div aria-hidden="true" style={{ height: 8, flex: 'none', marginTop: -2, background: `linear-gradient(135deg, ${fr.bg} 25%, transparent 25%) -6px 0 / 12px 12px, linear-gradient(225deg, ${fr.bg} 25%, transparent 25%) -6px 0 / 12px 12px` }} />}
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', margin: isPaper ? '18px 16px 22px' : 0, background: isPaper ? (t.dark ? mix(S, '#FFFFFF', 0.06) : mix(S, '#FFFFFF', 0.7)) : 'transparent', borderRadius: isPaper ? 6 : 0, boxShadow: isPaper ? '0 6px 24px rgba(0,0,0,0.16)' : 'none', overflow: 'hidden' }}>
          {art?.corner && !bare && (
            <>
              {corner({ left: 4, top: cornerTop }, 'none')}
              {corner({ right: 4, top: cornerTop }, 'scaleX(-1)')}
              {corner({ left: 4, bottom: 4 }, 'scaleY(-1)')}
              {corner({ right: 4, bottom: 4 }, 'scale(-1, -1)')}
            </>
          )}
          {frame && !bare && <FrameLayer frame={frame} C={C} t={t} wide={wide} />}
          <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', padding: fpad }}>

          {!bare && (
            <>
              {hasTop && <Art piece={art!.top} C={C} width="100%" height={art!.top!.h ?? 0} viewBox={`0 0 390 ${art!.top!.h}`} preserve={wide ? 'xMidYMin meet' : 'xMidYMin slice'} style={{ display: 'block', flex: 'none' }} />}
              {showBand && <div aria-hidden="true" style={{ height: layout === 'minimal' ? 6 : 14, flex: 'none', background: `linear-gradient(${P} 0 72%, ${A} 72%)` }} />}
              {lp === 'band' && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: -40, position: 'relative', zIndex: 3 }}>
                  {logoBox(80, 6, 26, design.plate ? '#FFFFFF' : S)}
                </div>
              )}
              <header style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: alignFlex, textAlign: centred ? 'center' : 'left', gap: 8, padding: hero ? '30px 24px 26px' : isBoard ? '26px 22px 14px' : '24px 24px 14px', background: hero ? P : 'transparent', color: hero ? t.onP : t.ink, overflow: 'hidden' }}>
                {art?.behind && (
                  <Art piece={art.behind} C={C} width={art.behind.size ?? 300} height={art.behind.size ?? 300} viewBox="0 0 300 300"
                    style={{ position: 'absolute', left: '50%', top: art.behind.top, transform: 'translateX(-50%)', opacity: art.behind.o ?? 1, pointerEvents: 'none' }} />
                )}
                {lp === 'watermark' && (
                  <div aria-hidden="true" style={{ position: 'absolute', right: -46, top: -28, width: 230, height: 230, opacity: 0.11, display: 'flex', pointerEvents: 'none' }}>{logoBox(230, 0, 92, 'transparent')}</div>
                )}
                {frame?.crest && (
                  <Art piece={frame.crest} C={Cf} width={220} height={Math.round(220 * (Number(String(frame.crest.v).split(' ')[3]) || 60) / (Number(String(frame.crest.v).split(' ')[2]) || 240))}
                    viewBox={vb(frame.crest, '0 0 240 60')} style={{ display: 'block', position: 'relative', maxWidth: '100%', alignSelf: 'center' }} />
                )}
                {lp === 'top' && logoBox(88, 8, 30)}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', justifyContent: alignFlex }}>
                  {lp === 'side' && logoBox(62, 6, 22)}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: alignFlex }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: hero ? t.onP : isBoard ? t.price : t.headSmall }}>Menu</p>
                    <h1 style={titleStyle}>{diner.local && data.local ? data.local : data.name}</h1>
                    {data.local && <p style={{ margin: 0, fontSize: 17, color: sub }}>{diner.local ? data.name : data.local}</p>}
                  </div>
                </div>
                {data.tag && <p style={{ margin: 0, position: 'relative', fontSize: 14, color: sub }}>{data.tag}</p>}
              </header>
              {hero && !hasTop && <div aria-hidden="true" style={{ height: 8, flex: 'none', background: t.A }} />}
              {seasonArt && <Art piece={seasonArt} C={C} width="100%" height={seasonArt.h ?? 44} viewBox={`0 0 390 ${seasonArt.h ?? 44}`} preserve={wide ? 'xMidYMid meet' : 'xMidYMid slice'} style={{ display: 'block', flex: 'none', margin: '-4px 0 4px' }} />}
              {layout === 'tabs' && sections.length > 1 && (
                <nav aria-label="Menu categories" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 22px 14px' }}>
                  {sections.map((sec, i) => (
                    <a key={sec.id} href={`#menu-${sec.id}`} style={{ flex: 'none', padding: '8px 14px', borderRadius: 999, textDecoration: 'none', fontSize: 13.5, fontWeight: 700, border: `1.5px solid ${i === 0 ? P : t.line}`, background: i === 0 ? P : 'transparent', color: i === 0 ? t.onP : t.ink }}>{nameOf(sec)}</a>
                  ))}
                </nav>
              )}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: B.gap, padding: B.pad, margin: layout === 'framed' ? '6px 16px 8px' : 0, border: layout === 'framed' ? `4px double ${t.head}` : 'none' }}>
            {tent}
            {!tent && specials.length > 0 && (
              <section aria-label="Today" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 16, border: `2px dashed ${t.A}`, background: t.surface }}>
                <h2 style={{ margin: 0, fontFamily: hf, fontSize: 20, fontWeight: hw as React.CSSProperties['fontWeight'], color: t.head }}>Today</h2>
                {specials.map((p, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 700 }}>{p.title}</span>
                    {p.body && <span style={{ fontSize: 13.5, color: t.muted }}>{p.body}</span>}
                  </div>
                ))}
              </section>
            )}
            {!tent && sections.map((sec, si) => (
              <div key={sec.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hasDiv && si > 0 && <Art piece={divPiece} C={frame ? Cf : C} width={240} height={28} viewBox="0 0 240 28" style={{ display: 'block', alignSelf: 'center', marginBottom: 4 }} />}
                <section id={`menu-${sec.id}`} style={{ display: 'flex', flexDirection: layout === 'side' ? 'row' : 'column', gap: 12, padding: cards ? '16px 16px 18px' : 0, background: cards ? t.surface : 'transparent', borderRadius: cards ? 18 : 0, boxShadow: cards ? '0 2px 10px rgba(0,0,0,0.07)' : 'none', scrollMarginTop: 12 }}>
                  <div style={{ padding: inset ? '0 16px' : 0 }}>{heading(sec, si)}</div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: inset ? '0 24px' : 0 }}>{body(sec)}</div>
                </section>
              </div>
            ))}
            {!tent && !sections.length && <p style={{ margin: 0, textAlign: 'center', color: t.muted }}>The menu is on its way.</p>}
          </div>

          {!bare && !tent && (
            <footer style={{ marginTop: 'auto', padding: '22px 24px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', fontSize: 12, color: t.muted }}>
              <span>Please tell us about any allergies.</span>
              <span>Rate your favourites on <strong style={{ color: t.headSmall }}>crumbs</strong></span>
            </footer>
          )}
          </div>
        </div>
        {isReceipt && <div aria-hidden="true" style={{ height: 8, flex: 'none', marginBottom: -2, background: `linear-gradient(45deg, ${fr.bg} 25%, transparent 25%) -6px 0 / 12px 12px, linear-gradient(315deg, ${fr.bg} 25%, transparent 25%) -6px 0 / 12px 12px` }} />}
      </div>
    </div>
  )
}

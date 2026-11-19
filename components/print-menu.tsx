'use client'
// O15 v2 (Round 99): print the table menu in the restaurant's own look — table tents (two to a
// page, fold along the dashed line) with the QR to the menu, and the full menu. The browser's
// own print dialog does the rest (print, or save as PDF).
import { useEffect, useMemo, useState } from 'react'
import { MenuView } from './menu-view'
import { normalizeDesign, resolveLook } from '@/lib/menu-design'
import { buildTableMenu } from '@/lib/table-menu-data'
import { torontoToday } from '@/lib/holidays'
import { restaurantPath, type PublicRestaurant } from '@/lib/public-page'
import { photoUrl } from '@/lib/photos'
import { siteOrigin } from '@/lib/site'

export function PrintMenu({ data }: { data: PublicRestaurant }) {
  const design = useMemo(
    () => normalizeDesign(data.menu_design, data.menu_theme),
    [data.menu_design, data.menu_theme],
  )
  const look = useMemo(() => resolveLook(design), [design])
  const [what, setWhat] = useState<'tent' | 'menu'>('tent')
  const [qr, setQr] = useState<string | null>(null)
  const link =
    data.city && data.slug ? `${siteOrigin()}${restaurantPath(data.city, data.slug)}/menu` : ''
  useEffect(() => {
    if (!link) return
    let live = true
    import('@/lib/brand-qr').then(async ({ brandQrSvg, svgDataUrl }) => {
      const svg = await brandQrSvg(link, {
        size: 600,
        label: `QR code that opens ${data.name}’s menu`,
      })
      if (live) setQr(svgDataUrl(svg))
    })
    return () => {
      live = false
    }
  }, [link, data.name])
  // the whole menu, whatever the time of day (printed menus stay on the table)
  const built = useMemo(
    () =>
      buildTableMenu(data, { today: torontoToday(), meal: null, logo: photoUrl(data.logo_path) }),
    [data],
  )
  const t = look.theme

  const tent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
        padding: '6px 0 18px',
      }}
    >
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: t.head }}>Scan for our menu</p>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={`QR code that opens ${data.name}’s menu`}
          style={{ width: 150, height: 150, background: '#FBF4E8', borderRadius: 16, padding: 8 }}
        />
      ) : (
        <div style={{ width: 150, height: 150 }} />
      )}
      <p style={{ margin: 0, fontSize: 14, color: t.muted }}>
        Point your camera here for the menu, today’s specials and what people love.
      </p>
    </div>
  )

  return (
    <div className="print-menu min-h-dvh bg-[#E9ECEA] text-[#1C2A23]">
      <style>{`
        @page { size: letter portrait; margin: 0.35in; }
        .print-menu * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .print-menu { background: none !important; }
          .no-print { display: none !important; }
          .print-sheet { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-white/95 p-3 shadow">
        <div
          className="segmented"
          role="radiogroup"
          aria-label="What to print"
          style={{ minWidth: 260 }}
        >
          <span
            className="segmented-thumb"
            aria-hidden="true"
            style={{ transform: what === 'menu' ? 'translateX(100%)' : 'none' }}
          />
          <button
            type="button"
            role="radio"
            aria-checked={what === 'tent'}
            className={what === 'tent' ? 'segmented-active' : ''}
            onClick={() => setWhat('tent')}
          >
            Table tents
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={what === 'menu'}
            className={what === 'menu' ? 'segmented-active' : ''}
            onClick={() => setWhat('menu')}
          >
            Full menu
          </button>
        </div>
        <button type="button" className="primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      {what === 'tent' ? (
        <div className="print-sheet mx-auto my-6 flex w-[7.8in] flex-col bg-white shadow-lg">
          <p className="no-print m-0 p-3 text-center text-sm text-[#5F6E65]">
            One tent per page: print it, fold on the dashed line so both halves face out, and stand
            it on the table.
          </p>
          <div style={{ transform: 'rotate(180deg)', height: '4.9in', overflow: 'hidden' }}>
            {/* drawn a little smaller so the name, artwork and QR all fit on each half */}
            <div style={{ zoom: 0.76, width: `${100 / 0.76}%` }}>
              <MenuView
                data={{ ...built.data, sections: [] }}
                design={design}
                look={look}
                tent={tent}
                wide
              />
            </div>
          </div>
          <div aria-hidden="true" style={{ borderTop: '2px dashed #9AA5A0' }} />
          <div style={{ height: '4.9in', overflow: 'hidden' }}>
            <div style={{ zoom: 0.76, width: `${100 / 0.76}%` }}>
              <MenuView
                data={{ ...built.data, sections: [] }}
                design={design}
                look={look}
                tent={tent}
                wide
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="print-sheet mx-auto my-6 w-[7.8in] bg-white shadow-lg">
          <MenuView data={built.data} design={design} look={look} photoUrl={photoUrl} wide />
        </div>
      )}
    </div>
  )
}

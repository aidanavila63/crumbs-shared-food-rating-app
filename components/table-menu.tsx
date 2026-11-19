'use client'
// O1 (Round 89): what a diner sees after scanning the QR on the table — the menu, big and plain,
// with the restaurant's own posts (today's specials) on top. Counted as a "table QR scan" for the
// owner (totals only).
// O15 v2 (Round 99): drawn in the owner's chosen look (MenuView) from what they keep in Crumbs:
// their categories, sold out today, badges, size prices… Diners get a small bar on top: their
// diet (other dishes dim), the restaurant's own language, bigger text, which menu, and dishes
// that aren't served right now tucked away (Round 97's served-at times). Night mode, holiday
// decorations and "today" are worked out on the phone, so the hour-long cached page stays right.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Wordmark } from './wordmark'
import { MenuView } from './menu-view'
import { countTap } from '@/lib/taps'
import { restaurantPath, type PublicRestaurant } from '@/lib/public-page'
import { isNight, normalizeDesign, resolveLook, seasonFor, torontoMinutes } from '@/lib/menu-design'
import { buildTableMenu, mealAt, MEAL_LABEL, menuNames } from '@/lib/table-menu-data'
import { torontoToday } from '@/lib/holidays'
import { photoUrl } from '@/lib/photos'

function Pill({ on, onClick, children, label, t }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string; t: { ink: string; bg: string; line: string } }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      style={{ flex: 'none', minHeight: 36, padding: '6px 12px', borderRadius: 999, border: `1.5px solid ${on ? t.ink : t.line}`, background: on ? t.ink : 'transparent', color: on ? t.bg : t.ink, fontSize: 13.5, fontWeight: 700 }}>
      {children}
    </button>
  )
}

export function TableMenu({ data }: { data: PublicRestaurant }) {
  useEffect(() => countTap(data.id, 'table_menu', data.claimed), [data.id, data.claimed])
  const design = useMemo(() => normalizeDesign(data.menu_design, data.menu_theme), [data.menu_design, data.menu_theme])
  // the phone's clock (not the server's: the page is kept for up to an hour)
  const [clock, setClock] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setClock(new Date())
    const first = setTimeout(tick, 0)
    const every = setInterval(tick, 60_000)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [])
  const [diet, setDiet] = useState<string | null>(null)
  const [local, setLocal] = useState(false)
  const [big, setBig] = useState(false)
  const [menuName, setMenuName] = useState<string | null>(null)
  const [wholeMenu, setWholeMenu] = useState(false)

  const today = clock ? torontoToday(clock) : null
  const meal = clock && !wholeMenu ? mealAt(torontoMinutes(clock)) : null
  const night = !!clock && isNight(design.night, clock)
  const look = useMemo(() => resolveLook(design, { night }), [design, night])
  const names = useMemo(() => menuNames(data), [data])
  const built = useMemo(
    () => buildTableMenu(data, { today: today ?? '', meal, menu: menuName, logo: photoUrl(data.logo_path) }),
    [data, today, meal, menuName],
  )
  const season = today ? seasonFor(today, design) : null
  const t = look.theme
  const bar = { ink: t.ink, bg: t.bg, line: t.line }
  const showBar = built.diets.length > 0 || built.hasLocal || names.length > 1 || built.notNow > 0 || wholeMenu

  return (
    <div className="table-menu min-h-dvh" style={{ background: look.style?.frame || look.layout === 'board' ? '#1C1C1E' : t.bg, color: t.ink }}>
      <div className="mx-auto flex max-w-[520px] flex-col">
        {showBar && (
          <nav aria-label="Menu options" className="sticky top-0 z-10 flex flex-col gap-2 px-3 py-2"
            style={{ background: `${t.bg}F2`, borderBottom: `1px solid ${t.line}`, backdropFilter: 'blur(6px)' }}>
            {names.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Which menu">
                {names.map((n) => (
                  <Pill key={n || 'main'} t={bar} on={(menuName ?? names[0]) === n} onClick={() => setMenuName(n)}>{n || 'Menu'}</Pill>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 overflow-x-auto">
              {built.diets.map((d) => (
                <Pill key={d} t={bar} on={diet === d} onClick={() => setDiet(diet === d ? null : d)}>{d}</Pill>
              ))}
              {built.hasLocal && <Pill t={bar} on={local} onClick={() => setLocal(!local)} label="Show names in the restaurant’s own language">{local ? 'English names' : 'Original names'}</Pill>}
              <Pill t={bar} on={big} onClick={() => setBig(!big)} label="Bigger text">A+</Pill>
            </div>
            {(built.notNow > 0 || wholeMenu) && (
              <p className="m-0 text-xs" style={{ color: t.muted }}>
                {wholeMenu ? 'Showing the whole menu. ' : `${MEAL_LABEL[mealAt(torontoMinutes(clock ?? new Date()))]} menu: ${built.notNow} dish${built.notNow === 1 ? '' : 'es'} served at other times. `}
                <button type="button" className="font-semibold underline" style={{ color: t.ink }} onClick={() => setWholeMenu(!wholeMenu)}>
                  {wholeMenu ? 'Show what’s served now' : 'Show the whole menu'}
                </button>
              </p>
            )}
            {diet && <p className="m-0 text-xs" style={{ color: t.muted }}>Labels come from the restaurant. Always check with your server about allergies.</p>}
          </nav>
        )}
        <div style={{ zoom: big ? 1.18 : 1 }}>
          <MenuView data={built.data} design={design} look={look} season={season} diner={{ diet, local }} photoUrl={photoUrl} />
        </div>
        <footer className="m-3 flex flex-col items-center gap-2 rounded-3xl bg-muted p-4 text-center text-sm text-foreground">
          <Wordmark height={22} />
          <p className="text-muted-foreground">
            Save {data.name}, rate your dishes and see what your friends loved.
          </p>
          {data.city && data.slug && (
            <Link className="primary w-full" href={restaurantPath(data.city, data.slug)}>
              See {data.name} on Crumbs
            </Link>
          )}
        </footer>
      </div>
    </div>
  )
}

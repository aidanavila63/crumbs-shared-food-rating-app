// E9 (Round 77): with lots of places, pins sitting on top of each other turn into one bubble with
// a count; tapping it zooms in. Pins close enough to overlap on screen (within ~56 px at the
// current zoom) are grouped; zoomed in far enough (15+) every pin shows on its own.
// Pure: tests/pin-groups.test.ts.
export type Pin = { id: string; lat: number; lng: number }
export type PinGroup<T extends Pin> = { key: string; lat: number; lng: number; items: T[] }

export const GROUP_BELOW_ZOOM = 15
export const GROUP_FROM_PINS = 30
const CELL_PX = 56

/** Where a point sits on the Web Mercator "world" at this zoom, in pixels. */
export function worldPx(lat: number, lng: number, zoom: number) {
  const size = 256 * 2 ** zoom
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}

/** Pins grouped by screen cell; a group of one is just that pin. */
export function groupPins<T extends Pin>(pins: T[], zoom: number): PinGroup<T>[] {
  if (pins.length < GROUP_FROM_PINS || zoom >= GROUP_BELOW_ZOOM)
    return pins.map((p) => ({ key: p.id, lat: p.lat, lng: p.lng, items: [p] }))
  const cells = new Map<string, T[]>()
  for (const pin of pins) {
    const { x, y } = worldPx(pin.lat, pin.lng, Math.floor(zoom))
    const key = `${Math.floor(x / CELL_PX)}:${Math.floor(y / CELL_PX)}`
    const cell = cells.get(key)
    if (cell) cell.push(pin)
    else cells.set(key, [pin])
  }
  return [...cells.entries()].map(([key, items]) => ({
    key: items.length === 1 ? items[0].id : `group:${key}`,
    lat: items.reduce((n, p) => n + p.lat, 0) / items.length,
    lng: items.reduce((n, p) => n + p.lng, 0) / items.length,
    items,
  }))
}

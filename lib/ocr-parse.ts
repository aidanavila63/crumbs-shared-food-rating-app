// #74 receipt scan and #19 menu photo: turn text read on the phone into something useful.
// Always shown on a confirm/edit screen — reading photos is never perfect.

const money = /(?:\$|€|£)?\s?(\d{1,4}(?:[.,]\d{2}))\b/g

const toNumber = (s: string) => Number(s.replace(',', '.'))

/** Best guess at a receipt's total (the line that says Total, else the biggest amount). */
export function receiptTotal(text: string): number | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const amounts = (line: string) => [...line.matchAll(money)].map((m) => toNumber(m[1]))
  const totalLine = [...lines]
    .reverse()
    .find(
      (line) =>
        /\b(grand\s*total|total|amount\s*due|balance\s*due|to\s*pay)\b/i.test(line) &&
        !/sub\s*-?\s*total/i.test(line) &&
        amounts(line).length,
    )
  if (totalLine) return amounts(totalLine).at(-1) ?? null
  const all = lines.flatMap(amounts).filter((n) => n > 0 && n < 10000)
  return all.length ? Math.max(...all) : null
}

/** Tip line, if the receipt has one. */
export function receiptTip(text: string): number | null {
  const line = text.split(/\r?\n/).find((l) => /\b(tip|gratuity)\b/i.test(l))
  const amount = line ? [...line.matchAll(money)].map((m) => toNumber(m[1])).at(-1) : undefined
  return amount ?? null
}

export type MenuLine = { name: string; price: number | null; description: string | null }

/** Lines that look like "Dish name ..... 14.50" become dishes. */
export function menuDishes(text: string): MenuLine[] {
  const out: MenuLine[] = []
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim())
  lines.forEach((line, i) => {
    const m = /^(.{3,70}?)[\s.\-–—·_:]*\$?\s?(\d{1,3}(?:[.,]\d{1,2})?)\s*\$?$/.exec(line)
    if (!m) return
    const name = m[1].replace(/[\s.\-–—·_:$]+$/, '').trim()
    const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '').length
    if (letters < 3 || /^(total|subtotal|tax|tip|page|serves|add|extra)\b/i.test(name)) return
    const price = toNumber(m[2])
    if (!(price > 0 && price < 500)) return
    // A following line without a price is often the description.
    const next = lines[i + 1]
    const description =
      next && !/\d[.,]?\d*\s*\$?$/.test(next) && next.length > 12 && next.length < 160 ? next : null
    out.push({ name: tidyName(name), price, description })
  })
  // Drop repeats (photos often catch the same line twice).
  const seen = new Set<string>()
  return out.filter((d) => {
    const key = d.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function tidyName(name: string) {
  const clean = name.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').slice(0, 80)
  // ALL CAPS menus → Title Case
  return clean === clean.toUpperCase()
    ? clean.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : clean
}

const NOT_FOOD =
  /\b(sub\s*-?\s*total|total|tax|hst|gst|pst|vat|tip|gratuity|service|delivery|fee|discount|promo|visa|mastercard|amex|debit|credit|cash|change|balance|amount|paid|card|order|table|server|guest|check|auth|approved|thank)\b/i

/**
 * #74 What you ordered, from a receipt or a delivery-app order screenshot (your own data):
 * "2 Pork Gyoza 19.00" → Pork Gyoza at 9.50 each. Skips totals, taxes, tips, fees and payment lines.
 */
export function receiptItems(text: string): MenuLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !NOT_FOOD.test(l))
    .map((line) => {
      const qty = /^(\d{1,2})\s*[x×]?\s+(?=[A-Za-zÀ-ÿ])/.exec(line)
      return { line: qty ? line.slice(qty[0].length) : line, qty: qty ? Number(qty[1]) : 1 }
    })
  const items = menuDishes(lines.map((l) => l.line).join('\n'))
  return items.map((item) => {
    const q =
      lines.find((l) => l.line.toLowerCase().startsWith(item.name.toLowerCase().slice(0, 6)))
        ?.qty ?? 1
    return {
      ...item,
      description: null,
      price: item.price !== null && q > 1 ? Math.round((item.price / q) * 100) / 100 : item.price,
    }
  })
}

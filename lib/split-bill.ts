// #142 Split the bill: who had what, who owes what. Just the maths — no payments, nothing stored.
export type BillItem = { name: string; price: number; qty?: number; who: string[] }
export type BillExtras = {
  /** tax as a % of the food (e.g. 13) — or `taxAmount` if you know it */
  taxPct?: number | null
  taxAmount?: number | null
  /** tip as a % of the food before tax (e.g. 18) — or `tipAmount` */
  tipPct?: number | null
  tipAmount?: number | null
}

const cents = (n: number) => Math.round(n * 100) / 100

/** Each person's share. Shared items split evenly between the people ticked; items with nobody
 *  ticked split between everyone. Tax and tip are shared in proportion to what each person had. */
export function splitBill(items: BillItem[], people: string[], extras: BillExtras = {}) {
  const food = new Map<string, number>(people.map((p) => [p, 0]))
  let subtotal = 0
  for (const item of items) {
    const line = item.price * (item.qty ?? 1)
    if (!(line > 0)) continue
    subtotal += line
    const who = item.who.filter((p) => food.has(p))
    const between = who.length ? who : people
    for (const p of between) food.set(p, (food.get(p) ?? 0) + line / between.length)
  }
  const tax = extras.taxAmount ?? (extras.taxPct ? (subtotal * extras.taxPct) / 100 : 0)
  const tip = extras.tipAmount ?? (extras.tipPct ? (subtotal * extras.tipPct) / 100 : 0)
  const total = subtotal + tax + tip
  const shares = people.map((p) => {
    const mine = food.get(p) ?? 0
    const part = subtotal ? mine / subtotal : 1 / Math.max(1, people.length)
    return { person: p, food: cents(mine), owes: cents(mine + (tax + tip) * part) }
  })
  // Rounding: the first person absorbs the last cent so shares add up to the total.
  const diff = cents(cents(total) - shares.reduce((s, x) => s + x.owes, 0))
  if (shares.length && diff) shares[0].owes = cents(shares[0].owes + diff)
  return {
    subtotal: cents(subtotal),
    tax: cents(tax),
    tip: cents(tip),
    total: cents(total),
    shares,
  }
}

/** "Hana Ramen — Maya $42.10 · Jordan $38.55 (incl. tax + 18% tip)" for the group chat. */
export function billText(
  placeName: string,
  result: ReturnType<typeof splitBill>,
  name: (id: string) => string,
  paidBy?: string | null,
) {
  const lines = result.shares.map((s) => `• ${name(s.person)}: $${s.owes.toFixed(2)}`)
  const who = paidBy ? `\n${name(paidBy)} paid — everyone else sends their share.` : ''
  return `🧾 ${placeName} — $${result.total.toFixed(2)} total (food $${result.subtotal.toFixed(2)}, tax $${result.tax.toFixed(2)}, tip $${result.tip.toFixed(2)})\n${lines.join('\n')}${who}\n— from Crumbs`
}

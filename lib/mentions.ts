// #137 @mentions in comments: "@Maya" (first name, any case) notifies Maya.
const first = (name: string) => (name || '').trim().split(/\s+/)[0]

/** User ids mentioned in `text`, from the group's names (id → display name). */
export function findMentions(text: string, names: Record<string, string>, me?: string) {
  const out: string[] = []
  for (const [id, name] of Object.entries(names)) {
    const f = first(name)
    if (!f || id === me) continue
    const re = new RegExp(
      `(^|\\s)@${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,!?:;])`,
      'i',
    )
    if (re.test(text)) out.push(id)
  }
  return out
}

/** Splits text into plain parts and @mention parts (for highlighting). */
export function mentionParts(text: string, names: Record<string, string>) {
  const firsts = Object.values(names).map(first).filter(Boolean)
  if (!firsts.length) return [{ text, mention: false }]
  const alt = firsts.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const split = new RegExp(`(@(?:${alt}))(?=$|[\\s.,!?:;])`, 'gi')
  const whole = new RegExp(`^@(?:${alt})$`, 'i')
  return text
    .split(split)
    .filter(Boolean)
    .map((part) => ({ text: part, mention: whole.test(part) }))
}

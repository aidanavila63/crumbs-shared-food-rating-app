// #37 Whose turn: the person who picked (or cooked) longest ago — or never — goes next.
export type TurnEvent = { user: string; on: string; label?: string }

export function whoseTurn(memberIds: string[], events: TurnEvent[]) {
  if (memberIds.length < 2) return null
  const lastBy = new Map<string, string>()
  events.forEach((event) => {
    if (!memberIds.includes(event.user)) return
    if ((lastBy.get(event.user) ?? '') < event.on) lastBy.set(event.user, event.on)
  })
  if (!lastBy.size) return null
  // Never picked beats anyone; otherwise the oldest "last time". Ties keep member order.
  const next = [...memberIds].sort((a, b) =>
    (lastBy.get(a) ?? '').localeCompare(lastBy.get(b) ?? ''),
  )[0]
  const last = [...events]
    .filter((event) => memberIds.includes(event.user))
    .sort((a, b) => b.on.localeCompare(a.on))[0]
  return { next, last }
}

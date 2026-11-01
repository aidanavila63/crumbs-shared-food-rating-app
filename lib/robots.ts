// robots.txt rules (RFC 9309): a restaurant site can ask Crumbs not to read it, and Crumbs
// listens. Pure functions only so they can be tested; fetching lives in menu-fetch.ts.

/** The name Crumbs' reader goes by (sites can name it in robots.txt). */
export const ROBOTS_AGENT = 'CrumbsMenuReader'

type Group = { agents: string[]; rules: { allow: boolean; path: string }[] }

function parse(txt: string): Group[] {
  const groups: Group[] = []
  let current: Group | null = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      // Several user-agent lines in a row share one set of rules.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false
      // An empty Disallow means "nothing is off limits".
      if (value) current.rules.push({ allow: key === 'allow', path: value })
    } else {
      lastWasAgent = false
    }
  }
  return groups
}

function matches(pattern: string, path: string) {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const regex = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${regex}${anchored ? '$' : ''}`).test(path)
}

/** May `agent` read `path` (path + query) under these rules? */
export function robotsAllows(txt: string, path: string, agent = ROBOTS_AGENT): boolean {
  const groups = parse(txt)
  const name = agent.toLowerCase()
  // Our own group if the site names us, otherwise the "*" group.
  const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)))
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes('*'))
  const rules = chosen.flatMap((g) => g.rules)
  let best: { allow: boolean; length: number } | null = null
  for (const rule of rules) {
    if (!matches(rule.path, path)) continue
    const length = rule.path.length
    // Longest match wins; on a tie, Allow wins.
    if (!best || length > best.length || (length === best.length && rule.allow))
      best = { allow: rule.allow, length }
  }
  return best ? best.allow : true
}

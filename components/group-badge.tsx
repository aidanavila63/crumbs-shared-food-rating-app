// Round 83: a group's badge — one of Crumbs' own line drawings, its emoji, or its first letter —
// on the group's colour.
import { crumbsBadge, type CrumbsBadge } from '@/lib/group-badges'
import { oneEmoji } from '@/lib/group-look'

export function BadgeDrawing({ badge, size = 20 }: { badge: CrumbsBadge; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {badge.paths.map((d, i) => {
        if (d.startsWith('dot:')) {
          const [cx, cy, r] = d.slice(4).split(',').map(Number)
          return <circle key={i} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
        }
        return <path key={i} d={d} />
      })}
    </svg>
  )
}

export function GroupBadge({
  group,
  size = 20,
  className = '',
}: {
  group: { name: string; emoji?: string | null; color?: string | null }
  size?: number
  className?: string
}) {
  const own = crumbsBadge(group.emoji)
  const emoji = own ? null : oneEmoji(group.emoji)
  return (
    <span
      className={`group-badge ${own ? 'group-badge-drawn' : ''} ${className}`}
      style={{ background: group.color ?? undefined }}
      aria-hidden="true"
    >
      {own ? (
        <BadgeDrawing badge={own} size={size} />
      ) : (
        (emoji ?? (group.name.trim().slice(0, 1).toUpperCase() || '·'))
      )}
    </span>
  )
}

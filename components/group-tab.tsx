'use client'
import { Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, Place, Profile } from '@/hooks/use-crumbs-data'
import { haptic, useCountUp } from '@/lib/motion'

function Stat({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value)
  return (
    <div className="surface-soft">
      <p className="font-serif text-3xl text-primary">{shown}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** Everything about the group: invite, how you're doing together, members, switching, leaving. */
export function GroupTab({
  group,
  groups,
  places = [],
  members = [],
  userId,
  supabase,
  demo = false,
  onGroup,
  onLeft,
}: {
  group: Group
  groups: Group[]
  places?: Place[]
  members?: Profile[]
  userId?: string
  supabase: any
  demo?: boolean
  onGroup: (group: Group) => void
  onLeft?: (groupId: string) => void
}) {
  async function share() {
    const text = `Join our Crumbs group ${group.name} with code ${group.join_code}`
    try {
      if (navigator.share) await navigator.share({ title: 'Join Crumbs', text })
      else {
        await navigator.clipboard.writeText(text)
        toast.success('Invite copied')
      }
    } catch {
      // share sheet cancelled
    }
  }
  return (
    <section className="stagger flex flex-col gap-4">
      <div className="surface">
        <p className="text-sm text-muted-foreground">Invite code</p>
        <div className="mt-2 flex items-center justify-between">
          <strong className="font-mono text-3xl tracking-[.25em]">{group.join_code}</strong>
          <div className="flex gap-2">
            <button
              className="icon-btn"
              aria-label="Copy invite code"
              onClick={() =>
                navigator.clipboard.writeText(group.join_code).then(() => {
                  haptic('tap')
                  toast.success('Code copied')
                })
              }
            >
              <Copy />
            </button>
            <button className="icon-btn" aria-label="Share invite" onClick={share}>
              <Share2 />
            </button>
          </div>
        </div>
      </div>
      <div className="surface">
        <h2 className="font-serif text-2xl font-bold">Together so far</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat value={places.length} label="places" />
          <Stat value={places.filter((place) => place.status === 'Been').length} label="been" />
          <Stat
            value={places.filter((place) => place.status === 'Want to try').length}
            label="to try"
          />
        </div>
      </div>
      <div className="surface">
        <h2 className="font-serif text-2xl font-bold">Members</h2>
        <div className="mt-3 flex flex-col gap-2">
          {members.map((member) => {
            const count = places.filter((place) =>
              place.place_ratings.some((rating) => rating.user_id === member.id),
            ).length
            return (
              <div className="surface-soft flex items-center justify-between gap-3" key={member.id}>
                <span>
                  <strong>{member.display_name}</strong>
                  {member.id === userId ? ' (you)' : ''}
                  {member.id === group.created_by && <span className="tag ml-2">owner</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {count} rating{count === 1 ? '' : 's'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {groups.length > 1 && (
        <div className="surface">
          <h2 className="font-serif text-2xl font-bold">Switch group</h2>
          <div className="mt-3 flex flex-col gap-2">
            {groups.map((item) => (
              <button
                className={`surface-soft text-left ${item.id === group.id ? 'ring-2 ring-primary' : ''}`}
                key={item.id}
                onClick={() => {
                  haptic('select')
                  onGroup(item)
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        className="secondary text-destructive"
        onClick={async () => {
          if (!window.confirm(`Leave ${group.name}? You can rejoin with the code.`)) return
          if (!demo) {
            const { error } = await supabase
              .from('group_members')
              .delete()
              .eq('group_id', group.id)
              .eq('user_id', userId)
            if (error) return toast.error(error.message)
          }
          onLeft?.(group.id)
        }}
      >
        Leave group
      </button>
    </section>
  )
}

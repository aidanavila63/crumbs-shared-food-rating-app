'use client'
import { overlapText, tasteOverlap } from '@/lib/taste-overlap'
import { settingsOf, type Scale } from '@/lib/ratings'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Group, Place, Profile } from '@/hooks/use-crumbs-data'
import { haptic, useCountUp } from '@/lib/motion'
import type { HomeMeal } from '@/hooks/use-crumbs-data'
import { ActivityFeed, MemoriesCard } from './group-feed'
import { OwnerTag } from './restaurant-profile'
import { photoUrl } from '@/lib/photos'
import { tasteProfile } from '@/lib/catch-up'
import { oneEmoji } from '@/lib/group-look'
import { JoinRequestsCard } from './join-requests'
import { AccessRequestsCard } from './access-requests'
import { askConfirm } from '@/lib/ask'

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
  view,
  meals = [],
  names = {},
  onSelect = () => {},
  v4 = false,
  onReload = () => {},
}: {
  v4?: boolean
  onReload?: () => void
  /** What you can see (blind ratings applied). */
  view?: Place[]
  meals?: HomeMeal[]
  names?: Record<string, string>
  onSelect?: (place: Place) => void
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
  // Group settings live here, for the owner and admins only.
  const myRole = userId === group.created_by ? 'owner' : members.find((m) => m.id === userId)?.role
  const canManage = myRole === 'owner' || myRole === 'admin'
  const [openMember, setOpenMember] = useState<string | null>(null)
  const cover = photoUrl(group.cover_path)
  return (
    <section className="stagger flex flex-col gap-4">
      {cover && (
        <div className="group-cover" style={{ backgroundImage: `url(${cover})` }}>
          <p className="font-serif text-3xl font-bold text-white">
            {oneEmoji(group.emoji) ? `${oneEmoji(group.emoji)} ` : ''}
            {group.name}
          </p>
        </div>
      )}
      {/* New people waiting for the gatekeeper's OK to get into Crumbs (only they see it). */}
      {v4 && <AccessRequestsCard supabase={supabase} demo={demo} onReload={onReload} />}
      {canManage && v4 && (
        <JoinRequestsCard group={group} supabase={supabase} demo={demo} onReload={onReload} />
      )}
      <MemoriesCard places={view ?? places} meals={meals} onSelect={onSelect} />
      <TasteOverlapCard places={view ?? places} names={names} userId={userId} scale={settingsOf(group).scale} />
      <ActivityFeed
        places={view ?? places}
        meals={meals}
        names={names}
        userId={userId}
        onSelect={onSelect}
      />
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
              <div className="surface-soft flex flex-col gap-2" key={member.id}>
                <button
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={openMember === member.id}
                  onClick={() => setOpenMember(openMember === member.id ? null : member.id)}
                >
                  <span>
                    <strong>{member.display_name}</strong>
                    {member.id === userId ? ' (you)' : ''}
                    {member.restaurant_owner && (
                      <span className="ml-2 align-middle">
                        <OwnerTag />
                      </span>
                    )}
                    {member.id === group.created_by ? (
                      <span className="tag ml-2">owner</span>
                    ) : member.role === 'admin' ? (
                      <span className="tag ml-2">admin</span>
                    ) : member.role === 'guest' ? (
                      <span className="tag ml-2">👀 guest</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {count} rating{count === 1 ? '' : 's'} ›
                  </span>
                </button>
                {openMember === member.id && <TasteProfile places={places} member={member} />}
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
          if (
            !(await askConfirm(`Leave ${group.name}?`, {
              body: 'You can rejoin with the code.',
              confirm: 'Leave',
              danger: true,
            }))
          )
            return
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

/** #191 A member's taste inside this group. */
function TasteProfile({ places, member }: { places: Place[]; member: Profile }) {
  const t = tasteProfile(places, member.id)
  if (!t) return <p className="rise-panel text-sm text-muted-foreground">No ratings here yet.</p>
  return (
    <div className="rise-panel flex flex-col gap-1 text-sm">
      <p>
        <strong>{t.rated}</strong> places rated · average <strong>{t.average}★</strong>
        {t.style ? ` · ${t.style}` : ''}
      </p>
      {t.cuisines.length > 0 && <p>Loves: {t.cuisines.join(', ')}</p>}
      {t.signature && (
        <p>
          Signature order: <strong>{t.signature.name}</strong> at {t.signature.place} (
          {t.signature.points}/100)
        </p>
      )}
    </div>
  )
}

/** Where the people in the group agree: cuisines two or more of you rate highly. */
function TasteOverlapCard({
  places,
  names,
  userId,
  scale,
}: {
  places: Place[]
  names: Record<string, string>
  userId?: string
  scale: Scale
}) {
  const overlaps = userId ? tasteOverlap(places, userId) : []
  if (!userId || !overlaps.length) return null
  return (
    <div className="surface">
      <h2 className="font-serif text-2xl font-bold">You agree on</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {overlaps.map((o) => (
          <li key={o.cuisine}>{overlapText(o, names, userId, scale)}</li>
        ))}
      </ul>
    </div>
  )
}

'use client'
import { overlapText, tasteOverlap } from '@/lib/taste-overlap'
import { settingsOf, type Scale } from '@/lib/ratings'
import { useState } from 'react'
import type { Group, Place, Profile } from '@/hooks/use-crumbs-data'
import { useCountUp } from '@/lib/motion'
import type { HomeMeal } from '@/hooks/use-crumbs-data'
import { ActivityFeed, MemoriesCard } from './group-feed'
import { photoUrl } from '@/lib/photos'
import { tasteProfile } from '@/lib/catch-up'
import { GroupBadge } from './group-badge'
import { JoinRequestsCard } from './join-requests'
import { AccessRequestsCard } from './access-requests'
import { RecentlyDeleted } from './group-ownership'
import { UnderlineTabs } from './underline-tabs'

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
  places = [],
  members = [],
  userId,
  supabase,
  demo = false,
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
  const [section, setSection] = useState<'activity' | 'members' | 'memories'>('activity')
  const cover = photoUrl(group.cover_path)
  return (
    <section className="stagger flex flex-col gap-4">
      {cover && (
        <div className="group-cover" style={{ backgroundImage: `url(${cover})` }}>
          <p className="font-serif text-3xl font-bold text-white">
            <GroupBadge group={group} size={26} className="mr-2 inline-grid align-middle" />
            {group.name}
          </p>
        </div>
      )}
      {/* New people waiting for the gatekeeper's OK to get into Crumbs (only they see it). */}
      {v4 && <AccessRequestsCard supabase={supabase} demo={demo} onReload={onReload} />}
      {canManage && v4 && (
        <JoinRequestsCard group={group} supabase={supabase} demo={demo} onReload={onReload} />
      )}
      {/* D5 (Round 83): Activity · Members · Memories. Leave group is in the ⋯ menu at the top. */}
      <UnderlineTabs
        label="Group"
        value={section}
        onChange={setSection}
        tabs={[
          { id: 'activity', label: 'Activity' },
          { id: 'members', label: 'Members', count: group.is_personal ? undefined : members.length },
          { id: 'memories', label: 'Memories' },
        ]}
      />
      {section === 'activity' && (
        <div key="activity" className="rise-panel flex flex-col gap-4">
          <ActivityFeed
            places={view ?? places}
            meals={meals}
            names={names}
            userId={userId}
            onSelect={onSelect}
          />
          {v4 && (
            <RecentlyDeleted
              group={group}
              supabase={supabase}
              demo={demo}
              canEmpty={canManage}
              canRestore={myRole !== 'guest'}
              names={names}
              onRestored={onReload}
            />
          )}
        </div>
      )}
      {section === 'members' && (
        <div key="members" className="rise-panel flex flex-col gap-4">
          {group.is_personal ? (
            <div className="surface">
              <h2 className="font-serif text-2xl font-bold">Just for you</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Nobody else can see or join My Crumbs. To share a place, open it and use{' '}
                <strong>Also save to…</strong> to put it in one of your groups (your scores go
                with it, never your notes).
              </p>
            </div>
          ) : (
            <div className="surface flex flex-col">
              {members.map((member) => {
                const count = places.filter((place) =>
                  place.place_ratings.some((rating) => rating.user_id === member.id),
                ).length
                const tag =
                  member.id === group.created_by
                    ? 'owner'
                    : member.role === 'admin'
                      ? 'admin'
                      : member.role === 'guest'
                        ? 'guest'
                        : member.restaurant_owner
                          ? 'restaurant owner'
                          : null
                return (
                  <div className="member-row" key={member.id}>
                    <button
                      className="flex w-full items-center justify-between gap-3 text-left"
                      aria-expanded={openMember === member.id}
                      onClick={() => setOpenMember(openMember === member.id ? null : member.id)}
                    >
                      <span className="min-w-0 truncate">
                        <strong>{member.display_name}</strong>
                        {member.id === userId ? ' (you)' : ''}
                        {tag && <span className="tag ml-2">{tag}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {count} rating{count === 1 ? '' : 's'}
                      </span>
                    </button>
                    {openMember === member.id && <TasteProfile places={places} member={member} />}
                  </div>
                )
              })}
            </div>
          )}
          <TasteOverlapCard
            places={view ?? places}
            names={names}
            userId={userId}
            scale={settingsOf(group).scale}
          />
        </div>
      )}
      {section === 'memories' && (
        <div key="memories" className="rise-panel flex flex-col gap-4">
          <MemoriesCard places={view ?? places} meals={meals} onSelect={onSelect} />
          <div className="surface">
            <h2 className="font-serif text-2xl font-bold">
              {group.is_personal ? 'So far' : 'Together so far'}
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat value={places.length} label="places" />
              <Stat value={places.filter((place) => place.status === 'Been').length} label="been" />
              <Stat
                value={places.filter((place) => place.status === 'Want to try').length}
                label="to try"
              />
            </div>
          </div>
        </div>
      )}
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

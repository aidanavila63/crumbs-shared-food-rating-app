'use client'
import { useEffect, useState } from 'react'
import { Copy, LogOut, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, Place, Profile } from '@/hooks/use-crumbs-data'
import { NotificationsToggle } from './notifications-toggle'
export function GroupTab({
  group,
  groups,
  places = [],
  members = [],
  profile,
  userId,
  supabase,
  onGroup,
  onLeft,
  onSignOut,
}: {
  group: Group
  groups: Group[]
  places?: Place[]
  members?: Profile[]
  profile?: Profile | null
  userId?: string
  onLeft?: (groupId: string) => void
  supabase: any
  onGroup: (group: Group) => void
  onSignOut: () => void
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name)
  }, [profile?.display_name])
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', userId)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Name updated')
  }
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
    <section className="flex flex-col gap-4">
      <div className="surface">
        <p className="text-sm text-muted-foreground">Invite code</p>
        <div className="mt-2 flex items-center justify-between">
          <strong className="font-mono text-3xl tracking-[.25em]">{group.join_code}</strong>
          <div className="flex gap-2">
            <button
              className="icon-btn"
              aria-label="Copy invite code"
              onClick={() =>
                navigator.clipboard
                  .writeText(group.join_code)
                  .then(() => toast.success('Code copied'))
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
        <h2 className="font-serif text-2xl font-bold">Your profile</h2>
        <input
          className="field mt-4"
          aria-label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <button className="primary mt-3 w-full" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </div>
      <div className="surface">
        <h2 className="font-serif text-2xl font-bold">Together so far</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="surface-soft">
            <p className="font-serif text-3xl text-primary">{places.length}</p>
            <p className="text-xs text-muted-foreground">places</p>
          </div>
          <div className="surface-soft">
            <p className="font-serif text-3xl text-primary">
              {places.filter((place) => place.status === 'Been').length}
            </p>
            <p className="text-xs text-muted-foreground">been</p>
          </div>
          <div className="surface-soft">
            <p className="font-serif text-3xl text-primary">
              {places.filter((place) => place.status === 'Want to try').length}
            </p>
            <p className="text-xs text-muted-foreground">to try</p>
          </div>
        </div>
        {members.length > 1 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
            {members.map((member) => {
              const scores = places.flatMap((place) =>
                place.place_ratings
                  .filter((rating) => rating.user_id === member.id)
                  .map((rating) => rating.score),
              )
              return (
                <li key={member.id}>
                  <strong className="text-foreground">{member.display_name}</strong>:{' '}
                  {scores.length
                    ? `${scores.length} ratings, average ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}★`
                    : 'no ratings yet'}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="surface">
        <h2 className="font-serif text-2xl font-bold">Members</h2>
        <div className="mt-3 flex flex-col gap-2">
          {members.map((member) => (
            <div className="surface-soft" key={member.id}>
              {member.display_name}
              {member.id === userId ? ' (you)' : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="surface">
        <h2 className="font-serif text-2xl font-bold">Switch group</h2>
        <div className="mt-3 flex flex-col gap-2">
          {groups.map((item) => (
            <button
              className={`surface-soft text-left ${item.id === group.id ? 'ring-2 ring-primary' : ''}`}
              key={item.id}
              onClick={() => onGroup(item)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <NotificationsToggle userId={userId} supabase={supabase} />
      <button
        className="secondary text-destructive"
        onClick={async () => {
          if (!window.confirm(`Leave ${group.name}? You can rejoin with the code.`)) return
          const { error } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', group.id)
            .eq('user_id', userId)
          if (error) toast.error(error.message)
          else onLeft?.(group.id)
        }}
      >
        Leave group
      </button>
      <button className="secondary" onClick={onSignOut}>
        <LogOut /> Sign out
      </button>
    </section>
  )
}

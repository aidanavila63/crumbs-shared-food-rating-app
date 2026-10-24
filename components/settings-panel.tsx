'use client'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, Profile } from '@/hooks/use-crumbs-data'
import { canVibrate, setMotionPrefs, useMotionPrefs } from '@/lib/motion'
import { Switch } from './switch'
import { PreferencesCard } from './preferences-card'
import { NotificationsToggle } from './notifications-toggle'

type Home = { lat: number; lng: number } | null

/** Settings, Pokémon GO style: grouped cards, switches, round ✕ to close (from the Overlay). */
export function SettingsPanel({
  profile,
  userId,
  group,
  supabase,
  demo,
  home,
  onHome,
  onProfile,
  onGroupRenamed,
  onSignOut,
}: {
  profile: Profile | null
  userId?: string
  group: Group
  supabase: any
  demo: boolean
  home: Home
  onHome: (home: Home) => void
  onProfile: (changes: Partial<Profile>) => void
  onGroupRenamed: (group: Group) => void
  onSignOut: () => void
}) {
  const prefs = useMotionPrefs()
  // Only rendered after a tap (inside the Settings overlay), so reading navigator here is safe.
  const [vibrates] = useState(canVibrate)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [groupName, setGroupName] = useState(group.name)
  const [saving, setSaving] = useState<'name' | 'group' | null>(null)
  const isOwner = !!userId && group.created_by === userId

  async function saveName() {
    const next = displayName.trim()
    if (!next || !userId) return
    setSaving('name')
    const { error } = demo
      ? { error: null }
      : await supabase.from('profiles').update({ display_name: next }).eq('id', userId)
    setSaving(null)
    if (error) return toast.error(error.message)
    onProfile({ display_name: next })
    toast.success('Name updated')
  }

  async function saveGroup() {
    const next = groupName.trim()
    if (!next || next === group.name) return
    setSaving('group')
    const { error } = demo
      ? { error: null }
      : await supabase.from('groups').update({ name: next }).eq('id', group.id)
    setSaving(null)
    if (error) return toast.error(error.message)
    onGroupRenamed({ ...group, name: next })
    toast.success('Group renamed')
  }

  return (
    <div className="stagger flex flex-col gap-4">
      <section className="surface settings-card">
        <h3 className="settings-heading">Look &amp; feel</h3>
        <div className="settings-row">
          <span>
            <span className="font-semibold">Animations</span>
            <span className="block text-sm text-muted-foreground">
              Smooth transitions and little celebrations.
            </span>
          </span>
          <Switch
            label="Animations"
            checked={prefs.animations}
            onChange={(on) => setMotionPrefs({ animations: on })}
          />
        </div>
        <div className="settings-row">
          <span>
            <span className="font-semibold">Vibration</span>
            <span className="block text-sm text-muted-foreground">
              {vibrates
                ? 'A small buzz when you tap and rate.'
                : 'This phone’s browser can’t vibrate (iPhones can’t).'}
            </span>
          </span>
          <Switch
            label="Vibration"
            checked={prefs.haptics && vibrates}
            disabled={!vibrates}
            onChange={(on) => setMotionPrefs({ haptics: on })}
          />
        </div>
      </section>

      <section className="surface settings-card">
        <h3 className="settings-heading">Your profile</h3>
        <label className="text-sm font-semibold" htmlFor="display-name">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            className="field"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && saveName()}
          />
          <button className="primary shrink-0" disabled={saving === 'name'} onClick={saveName}>
            {saving === 'name' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <PreferencesCard
        profile={profile}
        userId={userId}
        supabase={supabase}
        demo={demo}
        home={home}
        onHome={onHome}
        onProfile={onProfile}
      />

      <NotificationsToggle userId={userId} supabase={supabase} />

      {isOwner && (
        <section className="surface settings-card">
          <h3 className="settings-heading">Group settings</h3>
          <p className="text-sm text-muted-foreground">
            Only you see this — you created {group.name}.
          </p>
          <label className="text-sm font-semibold" htmlFor="group-name">
            Group name
          </label>
          <div className="flex gap-2">
            <input
              id="group-name"
              className="field"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && saveGroup()}
            />
            <button className="primary shrink-0" disabled={saving === 'group'} onClick={saveGroup}>
              {saving === 'group' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>
      )}

      <button className="secondary" onClick={onSignOut}>
        <LogOut size={18} /> Sign out
      </button>
    </div>
  )
}

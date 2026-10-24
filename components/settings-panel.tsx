'use client'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, Profile } from '@/hooks/use-crumbs-data'
import { canVibrate, haptic, setMotionPrefs, useMotionPrefs } from '@/lib/motion'
import { ACCENTS, TEXT_SIZES, setThemePrefs, useThemePrefs, type ThemeMode } from '@/lib/theme'
import { Switch } from './switch'
import { WEATHER_KEY, weatherNudgesOn } from './weather-nudge'
import { PreferencesCard } from './preferences-card'
import { NotificationsToggle } from './notifications-toggle'
import { GroupSettingsCard } from './group-settings'
import { YourDataCard } from './your-data-card'

// #73: which notifications you get. Missing = on.
const NOTIFY_TYPES = [
  ['rating', 'Ratings', 'Maya rated Hana Ramen 5★'],
  ['place', 'New places', 'Maya added Baan Thai'],
  ['dish', 'Dish scores', 'Maya gave Tonkotsu 92/100'],
  ['craving', 'Cravings', 'Maya is craving ramen'],
] as const

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
  onGroup,
  onSignOut,
  members = [],
  v4 = false,
  onReload = () => {},
}: {
  profile: Profile | null
  userId?: string
  group: Group
  supabase: any
  demo: boolean
  home: Home
  onHome: (home: Home) => void
  onProfile: (changes: Partial<Profile>) => void
  onGroup: (group: Group) => void
  onSignOut: () => void
  members?: Profile[]
  v4?: boolean
  onReload?: () => void
}) {
  const prefs = useMotionPrefs()
  const theme = useThemePrefs()
  const themes: ThemeMode[] = ['auto', 'light', 'dark']
  // Only rendered after a tap (inside the Settings overlay), so reading navigator here is safe.
  const [vibrates] = useState(canVibrate)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState<'name' | 'feedback' | null>(null)
  const [weatherOn, setWeatherOn] = useState(weatherNudgesOn)
  const [feedback, setFeedback] = useState('')
  const myRole = userId === group.created_by ? 'owner' : members.find((m) => m.id === userId)?.role
  const canManage = myRole === 'owner' || myRole === 'admin'
  const notify = profile?.notify ?? {}

  async function setNotify(key: string, on: boolean) {
    if (!userId) return
    const next = { ...notify, [key]: on }
    onProfile({ notify: next })
    if (demo) return
    const { error } = await supabase.from('profiles').update({ notify: next }).eq('id', userId)
    if (error) {
      onProfile({ notify })
      toast.error(error.message)
    }
  }

  async function sendFeedback() {
    const body = feedback.trim()
    if (!body) return
    setSaving('feedback')
    const { error } = demo
      ? { error: null }
      : await supabase.from('feedback').insert({ body: body.slice(0, 2000), page: 'settings' })
    setSaving(null)
    if (error) return toast.error(error.message)
    setFeedback('')
    haptic('success')
    toast.success('Thanks! Feedback sent.')
  }

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

  return (
    <div className="stagger flex flex-col gap-4">
      <section className="surface settings-card">
        <h3 className="settings-heading">Look &amp; feel</h3>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Theme</span>
          <div className="segmented segmented-3" role="radiogroup" aria-label="Theme">
            <span
              className="segmented-thumb"
              aria-hidden="true"
              style={{ transform: `translateX(${themes.indexOf(theme.theme) * 100}%)` }}
            />
            {themes.map((mode) => (
              <button
                key={mode}
                role="radio"
                aria-checked={theme.theme === mode}
                className={theme.theme === mode ? 'segmented-active' : ''}
                onClick={() => {
                  haptic('tap')
                  setThemePrefs({ theme: mode })
                }}
              >
                {mode === 'auto' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Accent colour</span>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((accent) => (
              <button
                key={accent.id}
                role="radio"
                aria-checked={theme.accent === accent.id}
                aria-label={accent.label}
                title={accent.label}
                className={`swatch ${theme.accent === accent.id ? 'swatch-on' : ''}`}
                style={{ background: accent.swatch }}
                onClick={() => {
                  haptic('select')
                  setThemePrefs({ accent: accent.id })
                }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Text size</span>
          <div className="segmented segmented-4" role="radiogroup" aria-label="Text size">
            <span
              className="segmented-thumb"
              aria-hidden="true"
              style={{
                transform: `translateX(${TEXT_SIZES.findIndex((t) => t.id === (theme.text ?? 'default')) * 100}%)`,
              }}
            />
            {TEXT_SIZES.map((size) => (
              <button
                key={size.id}
                role="radio"
                aria-checked={(theme.text ?? 'default') === size.id}
                className={(theme.text ?? 'default') === size.id ? 'segmented-active' : ''}
                onClick={() => {
                  haptic('tap')
                  setThemePrefs({ text: size.id })
                }}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
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
                : 'This phone’s browser can’t vibrate.'}
            </span>
          </span>
          <Switch
            label="Vibration"
            checked={prefs.haptics && vibrates}
            disabled={!vibrates}
            onChange={(on) => setMotionPrefs({ haptics: on })}
          />
        </div>
        <div className="settings-row">
          <span>
            <span className="font-semibold">Weather nudges</span>
            <span className="block text-sm text-muted-foreground">
              “Rainy tonight — soup weather” on Decide &amp; Plan. Uses your Home or allowed
              location.
            </span>
          </span>
          <Switch
            label="Weather nudges"
            checked={weatherOn}
            onChange={(on) => {
              setWeatherOn(on)
              try {
                localStorage.setItem(WEATHER_KEY, on ? 'on' : 'off')
              } catch {}
            }}
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

      {v4 && (
        <section className="surface settings-card">
          <h3 className="settings-heading">Notify me about</h3>
          {NOTIFY_TYPES.map(([key, label, example]) => (
            <div className="settings-row" key={key}>
              <span>
                <span className="font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">“{example}”</span>
              </span>
              <Switch
                label={label}
                checked={notify[key] !== false}
                onChange={(on) => setNotify(key, on)}
              />
            </div>
          ))}
        </section>
      )}

      {canManage && (
        <GroupSettingsCard
          group={group}
          members={members}
          userId={userId}
          supabase={supabase}
          demo={demo}
          v4={v4}
          onGroup={onGroup}
          onReload={onReload}
        />
      )}

      {v4 && (
        <section className="surface settings-card">
          <h3 className="settings-heading">Send feedback</h3>
          <textarea
            className="field"
            aria-label="Your feedback"
            placeholder="Something broken, confusing or that you’d love?"
            maxLength={2000}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <button
            className="primary"
            disabled={!feedback.trim() || saving === 'feedback'}
            onClick={sendFeedback}
          >
            {saving === 'feedback' ? 'Sending…' : 'Send'}
          </button>
        </section>
      )}

      {v4 && group && (
        <YourDataCard
          group={group}
          supabase={supabase}
          demo={demo}
          isOwner={group.created_by === userId}
          memberCount={members.length}
          onDeleted={onSignOut}
        />
      )}

      <button className="secondary" onClick={onSignOut}>
        <LogOut size={18} /> Sign out
      </button>
    </div>
  )
}

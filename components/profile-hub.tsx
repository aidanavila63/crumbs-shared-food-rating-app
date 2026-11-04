'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Gift, Globe2, Link2, Settings, ShieldCheck, Store, Trophy } from 'lucide-react'
import type { Group, HomeMeal, Place, Profile } from '@/hooks/use-crumbs-data'
import { badges } from '@/lib/badges'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'
import { PassportCard, StreakCard } from './goals-cards'
import { BingoCard, StatsPanel } from './stats-panel'
import { PhotoTimeline } from './photo-timeline'
import { SettingsPanel } from './settings-panel'
import { AdminPanel } from './admin-panel'
import { ContributionsCard } from './contributions-card'
import { OwnerPanel } from './owner-panel'
import { WrappedStory } from './wrapped'
import { PublicProfileSettings } from './public-profile-settings'
import { OwnerTag } from './restaurant-profile'
import { PhotoCropper } from './photo-cropper'
import { PHOTO_BUCKET, photoUrl, removePhoto, uploadPhoto } from '@/lib/photos'
import { wrappedSeason } from '@/lib/wrapped'
import { ChevronDown } from 'lucide-react'

export type HubPage =
  | 'menu'
  | 'achievements'
  | 'passport'
  | 'stats'
  | 'settings'
  | 'admin'
  | 'restaurants'
  | 'wrapped'
  | 'public'

const initial = (name?: string | null) => (name?.trim()?.[0] ?? '?').toUpperCase()

/** Round avatar in the top-right corner that opens your profile. */
export function ProfileButton({
  profile,
  onClick,
}: {
  profile: Profile | null
  onClick: () => void
}) {
  return (
    <button type="button" className="avatar-btn" aria-label="Open your profile" onClick={onClick}>
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span>{initial(profile?.display_name)}</span>
      )}
    </button>
  )
}

type SettingsProps = Omit<React.ComponentProps<typeof SettingsPanel>, 'profile' | 'group'>

/** Profile menu (round buttons) + the journal-style pages it opens. */
export function ProfileHub({
  pages,
  onPages,
  profile,
  group,
  places,
  allPlaces,
  members,
  userId,
  names,
  onSelect,
  settings,
  meals = [],
  onGroups,
}: {
  /** open the group switcher (switch, create, join, find) */
  onGroups?: () => void
  /** #61 home cooking counts in Wrapped */
  meals?: HomeMeal[]
  pages: HubPage[]
  onPages: (pages: HubPage[]) => void
  profile: Profile | null
  group: Group
  places: Place[]
  allPlaces: Place[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
  onSelect: (place: Place) => void
  settings: SettingsProps
}) {
  const open = (page: HubPage) => {
    haptic('select')
    onPages([...pages, page])
  }
  const closeTop = () => onPages(pages.slice(0, -1))
  const earned = useMemo(() => badges(allPlaces, userId), [allPlaces, userId])
  const earnedCount = earned.filter((badge) => badge.earned).length
  // #61 Wrapped is an event (Dec–Jan for the year, July for the first half); admins can peek.
  const season = wrappedSeason()
  const wrappedOpen = season.open || !!profile?.is_admin
  // Your own profile photo: pick → fit it in the circle → saved.
  const avatarInput = useRef<HTMLInputElement>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  async function saveAvatar(blob: Blob) {
    setAvatarFile(null)
    if (settings.demo) return toast('Photos need the real database, not demo mode')
    setAvatarBusy(true)
    try {
      const path = await uploadPhoto(settings.supabase, group.id, blob)
      const avatar_url = photoUrl(path)
      const { error } = await settings.supabase
        .from('profiles')
        .update({ avatar_url })
        .eq('id', userId)
      if (error) {
        await removePhoto(settings.supabase, path)
        return toast.error(error.message)
      }
      // Tidy the old one away if it was a Crumbs upload (not a sign-in picture).
      const old = profile?.avatar_url?.split(`/public/${PHOTO_BUCKET}/`)[1]
      if (old) await removePhoto(settings.supabase, old).catch(() => {})
      settings.onProfile({ avatar_url })
      toast.success('Profile photo saved')
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that photo')
    } finally {
      setAvatarBusy(false)
    }
  }

  const buttons: { page: HubPage; label: string; icon: React.ReactNode; note?: string }[] = [
    {
      page: 'achievements',
      label: 'Achievements',
      icon: <Trophy />,
      note: `${earnedCount}/${earned.length}`,
    },
    { page: 'passport', label: 'Passport', icon: <Globe2 /> },
    { page: 'stats', label: 'Stats & memories', icon: <BarChart3 /> },
    {
      page: 'wrapped',
      label: 'Wrapped',
      icon: <Gift />,
      note: season.open ? (season.half ? 'First half' : 'Open now') : `Opens ${season.opens}`,
    },
    { page: 'public', label: 'Public profile', icon: <Link2 /> },
    // #100 Verified restaurant owners get their own area.
    ...(profile?.restaurant_owner
      ? [{ page: 'restaurants' as const, label: 'Your restaurants', icon: <Store /> }]
      : []),
    // #21 Only Crumbs admins (profiles.is_admin) see this.
    ...(profile?.is_admin
      ? [{ page: 'admin' as const, label: 'Admin', icon: <ShieldCheck /> }]
      : []),
  ]

  return (
    <>
      {pages.includes('menu') && (
        <Overlay
          variant="menu"
          label="Your profile"
          onClose={() => onPages([])}
          action={
            <button
              className="icon-btn hub-gear"
              aria-label="Settings"
              onClick={() => open('settings')}
            >
              <Settings size={22} />
            </button>
          }
        >
          <div className="hub">
            <div className="hub-me">
              <button
                type="button"
                className="avatar-btn avatar-lg avatar-edit"
                aria-label={profile?.avatar_url ? 'Change your profile photo' : 'Add a profile photo'}
                disabled={avatarBusy}
                onClick={() => avatarInput.current?.click()}
              >
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initial(profile?.display_name)}</span>
                )}
                <span className="avatar-edit-badge" aria-hidden="true">
                  {avatarBusy ? '…' : '📷'}
                </span>
              </button>
              <input
                ref={avatarInput}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Profile photo"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) setAvatarFile(file)
                  event.target.value = ''
                }}
              />
              <p className="font-serif text-3xl font-bold">{profile?.display_name ?? 'You'}</p>
              {profile?.restaurant_owner && <OwnerTag />}
              {(profile?.is_builder || profile?.is_admin) && (
                <span className="tag" title="Trusted to build Crumbs’ data: your answers count straight away">
                  🛠️ Builder
                </span>
              )}
              {onGroups ? (
                <button
                  type="button"
                  className="group-switch-chip"
                  aria-label={`${group.name} — switch, create or join a group`}
                  onClick={onGroups}
                >
                  {group.emoji ? `${group.emoji} ` : ''}
                  {group.name} <ChevronDown size={14} />
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">{group.name}</p>
              )}
            </div>
            <div className="hub-grid">
              {buttons.map((button, index) => (
                <button
                  key={button.page}
                  className="hub-btn"
                  style={{ '--i': index } as React.CSSProperties}
                  onClick={() => open(button.page)}
                >
                  <span className="hub-circle">{button.icon}</span>
                  <span className="hub-label">{button.label}</span>
                  {button.note && <span className="hub-note">{button.note}</span>}
                </button>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {pages.at(-1) === 'achievements' && (
        <Overlay label="Achievements" title="Achievements" onClose={closeTop}>
          <div className="stagger flex flex-col gap-4">
            <StreakCard places={allPlaces} />
            <PassportCard places={allPlaces} />
            <ContributionsCard
              supabase={settings.supabase}
              demo={settings.demo}
              v4={!!settings.v4}
            />
            <div className="badge-grid">
              {earned.map((badge) => (
                <div
                  key={badge.id}
                  className={`badge ${badge.earned ? 'badge-earned' : ''}`}
                  aria-label={`${badge.title}: ${badge.earned ? 'earned' : `${badge.progress} of ${badge.target}`}`}
                >
                  <span className="badge-emoji" aria-hidden="true">
                    {badge.emoji}
                  </span>
                  <span className="text-sm font-bold">{badge.title}</span>
                  <span className="text-xs text-muted-foreground">{badge.how}</span>
                  {!badge.earned && (
                    <span className="badge-bar" aria-hidden="true">
                      <span
                        className="bar-fill"
                        style={{ width: `${(badge.progress / badge.target) * 100}%` }}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {pages.at(-1) === 'public' && (
        <Overlay label="Public profile" title="Public profile" onClose={closeTop}>
          <PublicProfileSettings
            supabase={settings.supabase}
            demo={settings.demo}
            userId={userId}
            profile={profile}
            places={allPlaces}
          />
        </Overlay>
      )}

      {pages.at(-1) === 'passport' && (
        <Overlay label="Cuisine passport" title="Cuisine passport" onClose={closeTop}>
          <div className="stagger flex flex-col gap-4">
            <BingoCard places={allPlaces} />
          </div>
        </Overlay>
      )}

      {pages.at(-1) === 'stats' && (
        <Overlay label="Stats and memories" title="Stats & memories" onClose={closeTop}>
          <div className="stagger flex flex-col gap-4">
            <StatsPanel
              places={places}
              members={members}
              userId={userId}
              names={names}
              onSelect={onSelect}
            />
            <PhotoTimeline places={places} onSelect={onSelect} />
            {!places.length && (
              <p className="empty text-sm text-muted-foreground">
                Rate and log a few places to see stats here.
              </p>
            )}
          </div>
        </Overlay>
      )}

      {pages.at(-1) === 'admin' && profile?.is_admin && (
        <Overlay label="Admin" title="Admin" onClose={closeTop}>
          <AdminPanel supabase={settings.supabase} demo={settings.demo} />
        </Overlay>
      )}

      {pages.at(-1) === 'wrapped' && wrappedOpen && (
        <Overlay label="Crumbs Wrapped" variant="story" onClose={closeTop}>
          <WrappedStory
            places={places}
            meals={meals}
            group={group}
            members={members}
            userId={userId}
            season={season.open ? { year: season.year, half: season.half } : undefined}
          />
        </Overlay>
      )}
      {pages.at(-1) === 'wrapped' && !wrappedOpen && (
        <Overlay label="Crumbs Wrapped" title="Crumbs Wrapped" onClose={closeTop}>
          <div className="surface flex flex-col items-center gap-2 text-center">
            <p className="text-5xl" aria-hidden="true">
              🎁
            </p>
            <p className="font-serif text-2xl font-bold">Back on {season.opens}</p>
            <p className="text-sm text-muted-foreground">
              Wrapped is an event: your year in food opens every December (until the end of
              January), and a first-half look opens every July. Keep logging visits and home
              cooking — it builds itself.
            </p>
          </div>
        </Overlay>
      )}
      {avatarFile && (
        <PhotoCropper
          file={avatarFile}
          aspect={1}
          round
          outWidth={512}
          title="Your profile photo"
          onCancel={() => setAvatarFile(null)}
          onDone={saveAvatar}
        />
      )}

      {pages.at(-1) === 'restaurants' && profile?.restaurant_owner && (
        <Overlay label="Your restaurants" title="Your restaurants" onClose={closeTop}>
          <OwnerPanel supabase={settings.supabase} demo={settings.demo} />
        </Overlay>
      )}

      {pages.at(-1) === 'settings' && (
        <Overlay label="Settings" title="Settings" onClose={closeTop}>
          <SettingsPanel profile={profile} group={group} {...settings} />
        </Overlay>
      )}
    </>
  )
}

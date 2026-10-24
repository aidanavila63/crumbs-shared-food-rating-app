'use client'
import { useMemo } from 'react'
import { BarChart3, Globe2, Settings, Trophy } from 'lucide-react'
import type { Group, Place, Profile } from '@/hooks/use-crumbs-data'
import { badges } from '@/lib/badges'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'
import { StreakCard } from './goals-cards'
import { BingoCard, StatsPanel } from './stats-panel'
import { PhotoTimeline } from './photo-timeline'
import { SettingsPanel } from './settings-panel'

export type HubPage = 'menu' | 'achievements' | 'passport' | 'stats' | 'settings'

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
}: {
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

  const buttons: { page: HubPage; label: string; icon: React.ReactNode; note?: string }[] = [
    {
      page: 'achievements',
      label: 'Achievements',
      icon: <Trophy />,
      note: `${earnedCount}/${earned.length}`,
    },
    { page: 'passport', label: 'Passport', icon: <Globe2 /> },
    { page: 'stats', label: 'Stats & memories', icon: <BarChart3 /> },
    { page: 'settings', label: 'Settings', icon: <Settings /> },
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
              <span className="avatar-btn avatar-lg" aria-hidden="true">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initial(profile?.display_name)}</span>
                )}
              </span>
              <p className="font-serif text-3xl font-bold">{profile?.display_name ?? 'You'}</p>
              <p className="text-sm text-muted-foreground">{group.name}</p>
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

      {pages.at(-1) === 'settings' && (
        <Overlay label="Settings" title="Settings" onClose={closeTop}>
          <SettingsPanel profile={profile} group={group} {...settings} />
        </Overlay>
      )}
    </>
  )
}

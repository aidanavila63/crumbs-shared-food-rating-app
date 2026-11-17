'use client'
// D1 (Round 83): one ⋯ button next to the group name opens the group menu: invite people (code,
// link, QR), group locations, group settings (owner and admins), switch group, leave group. Each
// opens on its own page so the Group tab stays about the group.
import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  ChevronRight,
  Copy,
  Link2,
  MapPin,
  MoreHorizontal,
  QrCode,
  Settings,
  Share2,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Area, Group, GroupLocation, Place, Profile } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { inviteLink } from '@/lib/invite'
import { Overlay } from './overlay'
import { GroupSettingsCard } from './group-settings'
import { GroupLocationsCard } from './group-locations'
import { SharePosterCard } from './share-poster'
import { LeaveGroup } from './group-ownership'

export function GroupActions({
  group,
  members,
  userId,
  supabase,
  demo,
  v4,
  onGroup,
  onReload,
  locations,
  locationsReady,
  myAreas,
  places,
  onLocations,
  onSwitch,
  onLeft,
}: {
  /** open the group switcher */
  onSwitch: () => void
  /** you left (or deleted) the group */
  onLeft?: (groupId: string) => void
  /** Round 75: the group's shared locations (hidden until the database has them) */
  locations: GroupLocation[]
  locationsReady: boolean
  myAreas: Area[]
  places: Place[]
  onLocations: (next: GroupLocation[]) => void
  group: Group
  members: Profile[]
  userId?: string
  supabase: any
  demo: boolean
  v4: boolean
  onGroup: (group: Group) => void
  onReload: () => void
}) {
  const myRole = userId === group.created_by ? 'owner' : members.find((m) => m.id === userId)?.role
  const canManage = myRole === 'owner' || myRole === 'admin'
  const [open, setOpen] = useState<'menu' | 'invite' | 'settings' | 'locations' | null>(null)
  const [showQr, setShowQr] = useState(true)
  const [qr, setQr] = useState<string | null>(null)
  // Crumbs-style QR (plum dots, cookie in the middle, crumb trail). The QR library is only downloaded when
  // someone asks for the code.
  useEffect(() => {
    if (open !== 'invite' || !showQr) return
    let cancelled = false
    import('@/lib/brand-qr')
      .then(({ brandQrSvg, svgDataUrl }) =>
        brandQrSvg(inviteLink(group.join_code), { label: `QR code to join ${group.name}` }).then(svgDataUrl),
      )
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && toast.error('Could not make a QR code'))
    return () => {
      cancelled = true
    }
  }, [open, showQr, group.join_code, group.name])

  async function share() {
    // Carries who shared it, so the "Wants to join" list can say who invited them.
    const link = inviteLink(group.join_code, undefined, userId)
    const text = `Join our Crumbs group ${group.name}: ${link} (or use code ${group.join_code})`
    try {
      if (navigator.share) await navigator.share({ title: 'Join Crumbs', text, url: link })
      else {
        await navigator.clipboard.writeText(text)
        toast.success('Invite copied')
      }
    } catch {
      // share sheet cancelled
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink(group.join_code))
      haptic('tap')
      toast.success('Invite link copied')
    } catch {
      toast(inviteLink(group.join_code))
    }
  }

  return (
    <span className="group-actions">
      <button
        className="icon-btn group-action-btn"
        aria-label="Group menu"
        aria-haspopup="dialog"
        onClick={() => {
          haptic('tap')
          setOpen('menu')
        }}
      >
        <MoreHorizontal size={20} />
      </button>
      {open === 'menu' && (
        <Overlay label="Group menu" title={group.name} onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3">
            <div className="menu-list surface">
              {myRole !== 'guest' && !group.is_personal && (
                <MenuRow icon={<UserPlus size={18} />} label="Invite people" onClick={() => setOpen('invite')} />
              )}
              {locationsReady && (
                <MenuRow icon={<MapPin size={18} />} label="Group locations" onClick={() => setOpen('locations')} />
              )}
              {canManage && (
                <MenuRow
                  icon={<Settings size={18} />}
                  label={group.is_personal ? 'Settings for this space' : 'Group settings'}
                  onClick={() => setOpen('settings')}
                />
              )}
              <MenuRow
                icon={<ArrowLeftRight size={18} />}
                label="Switch, start or join a group"
                onClick={() => {
                  setOpen(null)
                  onSwitch()
                }}
              />
            </div>
            {!group.is_personal && (
              <LeaveGroup
                group={group}
                members={members}
                userId={userId}
                supabase={supabase}
                demo={demo}
                onLeft={(id) => {
                  setOpen(null)
                  onLeft?.(id)
                }}
              />
            )}
          </div>
        </Overlay>
      )}
      {open === 'invite' && (
        <Overlay label="Invite people" title="Invite people" onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Share the link or code, or let them scan the QR code.
            </p>
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
              <div className="mt-3 flex gap-2">
                <button className="secondary flex-1 !min-h-10 text-sm" onClick={copyLink}>
                  <Link2 size={16} /> Copy invite link
                </button>
                <button
                  className={`${showQr ? 'primary' : 'secondary'} flex-1 !min-h-10 text-sm`}
                  aria-pressed={showQr}
                  onClick={() => {
                    haptic('tap')
                    setShowQr(!showQr)
                  }}
                >
                  <QrCode size={16} /> {showQr ? 'Hide QR' : 'QR code'}
                </button>
              </div>
              {showQr && (
                <div className="preview-pop mt-3 flex flex-col items-center gap-2">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt={`QR code to join ${group.name}`}
                      className="w-60 rounded-[1.25rem] shadow-sm"
                    />
                  ) : (
                    <div className="skeleton size-60 rounded-[1.25rem]" />
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    Scan with a phone camera to join. New people sign in first, then join
                    automatically.
                  </p>
                </div>
              )}
            </div>
            <SharePosterCard group={group} />
          </div>
        </Overlay>
      )}
      {open === 'locations' && (
        <Overlay label="Group locations" title="Group locations" onClose={() => setOpen(null)}>
          <GroupLocationsCard
            group={group}
            locations={locations}
            myAreas={myAreas}
            places={places}
            canManage={canManage}
            isGuest={myRole === 'guest'}
            userId={userId}
            supabase={supabase}
            demo={demo}
            onLocations={onLocations}
            onGroup={onGroup}
          />
        </Overlay>
      )}
      {open === 'settings' && (
        <Overlay label="Group settings" title="Group settings" onClose={() => setOpen(null)}>
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
        </Overlay>
      )}
    </span>
  )
}

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="menu-row"
      onClick={() => {
        haptic('tap')
        onClick()
      }}
    >
      <span className="text-primary" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-left font-semibold">{label}</span>
      <ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { Copy, Link2, QrCode, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, Place, Profile } from '@/hooks/use-crumbs-data'
import { haptic, useCountUp } from '@/lib/motion'
import { inviteLink } from '@/lib/invite'
import type { HomeMeal } from '@/hooks/use-crumbs-data'
import { ActivityFeed, MemoriesCard } from './group-feed'
import { OwnerTag } from './restaurant-profile'

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
}: {
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
  const [showQr, setShowQr] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  // The QR library is only downloaded when someone asks for the code.
  useEffect(() => {
    if (!showQr) return
    let cancelled = false
    import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(inviteLink(group.join_code), {
          margin: 1,
          width: 480,
          color: { dark: '#1c2a23', light: '#ffffff' },
        }),
      )
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && toast.error('Could not make a QR code'))
    return () => {
      cancelled = true
    }
  }, [showQr, group.join_code])
  async function share() {
    const link = inviteLink(group.join_code)
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
                className="w-56 rounded-2xl border border-border bg-white p-2"
              />
            ) : (
              <div className="skeleton size-56" />
            )}
            <p className="text-center text-xs text-muted-foreground">
              Scan with a phone camera to join. New people sign in first, then join automatically.
            </p>
          </div>
        )}
      </div>
      <MemoriesCard places={view ?? places} meals={meals} onSelect={onSelect} />
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
              <div className="surface-soft flex items-center justify-between gap-3" key={member.id}>
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
                  ) : null}
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

'use client'
// Small buttons next to the group name: 👋 invite people (code, link, QR) and ⚙️ group settings
// (owner and admins only). They open on their own pages so the Group tab stays about the group.
import { useEffect, useState } from 'react'
import { Copy, Link2, QrCode, Settings, Share2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, Profile } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { inviteLink } from '@/lib/invite'
import { Overlay } from './overlay'
import { GroupSettingsCard } from './group-settings'

export function GroupActions({
  group,
  members,
  userId,
  supabase,
  demo,
  v4,
  onGroup,
  onReload,
}: {
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
  const [open, setOpen] = useState<'invite' | 'settings' | null>(null)
  const [showQr, setShowQr] = useState(true)
  const [qr, setQr] = useState<string | null>(null)
  // The QR library is only downloaded when someone asks for the code.
  useEffect(() => {
    if (!open || !showQr) return
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
  }, [open, showQr, group.join_code])

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
    <span className="group-actions">
      {myRole !== 'guest' && (
        <button
          className="icon-btn group-action-btn"
          aria-label="Invite people"
          onClick={() => {
            haptic('tap')
            setOpen('invite')
          }}
        >
          <UserPlus size={18} />
        </button>
      )}
      {canManage && (
        <button
          className="icon-btn group-action-btn"
          aria-label="Group settings"
          onClick={() => {
            haptic('tap')
            setOpen('settings')
          }}
        >
          <Settings size={18} />
        </button>
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
                      className="w-56 rounded-2xl border border-border bg-white p-2"
                    />
                  ) : (
                    <div className="skeleton size-56" />
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    Scan with a phone camera to join. New people sign in first, then join
                    automatically.
                  </p>
                </div>
              )}
            </div>
          </div>
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

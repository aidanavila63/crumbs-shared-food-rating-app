'use client'
// "Posters" card on the Invite screen: a story-sized picture with a QR code that someone can scan to
// join this group, or to join Crumbs itself. Share it to an Instagram story or send it straight to a
// friend (the phone's share sheet), or save the picture.
import { useEffect, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Group } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { inviteLink } from '@/lib/invite'
import { crumbsPoster, downloadBlob, groupPoster, makePoster, sharePoster } from '@/lib/poster'

type Kind = 'group' | 'crumbs'

export function SharePosterCard({ group }: { group: Group }) {
  const [kind, setKind] = useState<Kind>('group')
  const { name, emoji, color, join_code: code } = group
  // The picture is kept with what it was made for, so a stale one is never shown for a new choice.
  const key = `${kind}|${name}|${emoji}|${color}|${code}`
  const [made, setMade] = useState<{ key: string; blob: Blob; url: string } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const ready = made?.key === key ? made : null
  const blob = ready?.blob ?? null
  const preview = ready?.url ?? null
  const failed = failedKey === key

  const link = kind === 'group' ? inviteLink(code) : `${window.location.origin}/`
  const fileName = kind === 'group' ? `join-${slug(name)}-on-crumbs.png` : 'join-crumbs.png'
  const message =
    kind === 'group'
      ? `Join our Crumbs group ${name}: ${link}`
      : `Come find places to eat with me on Crumbs: ${link}`

  // Draw the picture whenever the choice (or the group's name, emoji or code) changes.
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    const spec =
      kind === 'group'
        ? groupPoster({ name, emoji, color, join_code: code }, inviteLink(code))
        : crumbsPoster(`${window.location.origin}/`)
    makePoster(spec)
      .then((picture) => {
        if (cancelled) return
        url = URL.createObjectURL(picture)
        setMade({ key, blob: picture, url })
      })
      .catch(() => !cancelled && setFailedKey(key))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [kind, name, emoji, color, code, key])

  async function share() {
    if (!blob) return
    haptic('tap')
    const result = await sharePoster(blob, fileName, message)
    if (result === 'saved') toast.success('Poster saved')
  }
  function save() {
    if (!blob) return
    haptic('tap')
    downloadBlob(blob, fileName)
    toast.success('Poster saved')
  }

  return (
    <div className="surface flex flex-col gap-3">
      <div>
        <h3 className="font-serif text-xl font-bold">Posters</h3>
        <p className="text-sm text-muted-foreground">
          A picture with a QR code. Post it to an Instagram story, or send it straight to a friend.
        </p>
      </div>
      <div className="chip-row" role="radiogroup" aria-label="Which poster">
        {(
          [
            ['group', 'Join this group'],
            ['crumbs', 'Join Crumbs'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={kind === value}
            className={`chip ${kind === value ? 'chip-active' : ''}`}
            onClick={() => {
              if (kind !== value) haptic('select')
              setKind(value)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mx-auto w-44">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={kind === 'group' ? `Poster to join ${name} on Crumbs` : 'Poster to join Crumbs'}
            className="preview-pop aspect-[9/16] w-44 rounded-2xl shadow-md"
          />
        ) : failed ? (
          <p className="grid aspect-[9/16] w-44 place-items-center rounded-2xl bg-muted p-3 text-center text-xs text-muted-foreground">
            Couldn’t make the poster. Try again in a moment.
          </p>
        ) : (
          <div className="skeleton aspect-[9/16] w-44 rounded-2xl" />
        )}
      </div>
      <div className="flex gap-2">
        <button className="primary flex flex-1 items-center justify-center gap-2" disabled={!blob} onClick={share}>
          <Share2 size={16} /> Share
        </button>
        <button className="secondary flex flex-1 items-center justify-center gap-2" disabled={!blob} onClick={save}>
          <Download size={16} /> Save
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {kind === 'group'
          ? 'On iPhone: Share → Instagram → Your story. Anyone who scans it lands on this group’s invite page.'
          : 'On iPhone: Share → Instagram → Your story. Scanning opens Crumbs; new people may need an OK before they’re in.'}
      </p>
    </div>
  )
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'group'

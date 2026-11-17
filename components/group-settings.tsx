'use client'
import { useState } from 'react'
import { GroupBadge, BadgeDrawing } from './group-badge'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, GroupSettings, Profile } from '@/hooks/use-crumbs-data'
import { settingsOf, type Scale } from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { Switch } from './switch'
import { PhotoButton } from './photo-button'
import { JOIN_MODES } from './group-switcher'
import { askConfirm } from '@/lib/ask'
import { inviteLink } from '@/lib/invite'
import { EMOJI_SETS, singleEmoji } from '@/lib/group-look'
import { CRUMBS_BADGES, badgeValue } from '@/lib/group-badges'

// One emoji per group, picked from a list (free typing let two squeeze in and get cut off).
export const GROUP_EMOJIS = EMOJI_SETS.flatMap((set) => set.emoji)

const COLORS = ['#7b2d5b', '#b23a26', '#1f5f8b', '#2f6b4a', '#8f5a06', '#4b3f8f']
const SCALES: { id: Scale; label: string }[] = [
  { id: '5', label: '5 stars' },
  { id: 'half', label: 'Half stars' },
  { id: '10', label: '10 points' },
]

/**
 * Group settings (owner + admins): name, look (#46), rating scale (#2), category scores (#1),
 * would-go-back (#3), whose turn (#37), Home cooking (#77), weather (#35), vibe tags (#8),
 * members + admins (#43) and a fresh invite code.
 */
export function GroupSettingsCard({
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
  const s = settingsOf(group)
  const isOwner = !!userId && group.created_by === userId
  // Round 80: My Crumbs has no one to invite, list or let in.
  const personal = !!group.is_personal
  const [name, setName] = useState(group.name)
  const [picking, setPicking] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(changes: Partial<Group>, message?: string) {
    const before = group
    onGroup({ ...group, ...changes })
    if (demo) return message && toast.success(message)
    const { error } = await supabase.from('groups').update(changes).eq('id', group.id)
    if (error) {
      onGroup(before)
      return toast.error(error.message)
    }
    if (message) toast.success(message)
  }
  const setSetting = (changes: Partial<GroupSettings>) =>
    save({ settings: { ...(group.settings ?? {}), ...changes } })

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    if (demo) return toast(ok)
    setBusy(true)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(ok)
    onReload()
    return data
  }

  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Group settings</h3>
      <p className="text-sm text-muted-foreground">
        {personal
          ? 'Your private space. Only you can see it, and nobody can join it.'
          : `${isOwner ? 'You created' : 'You’re an admin of'} ${group.name}. These apply to everyone in it.`}
      </p>

      <label className="text-sm font-semibold" htmlFor="group-name">
        Group name
      </label>
      <div className="flex gap-2">
        <input
          id="group-name"
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && name.trim() && save({ name: name.trim() }, 'Group renamed')}
        />
        <button
          className="primary shrink-0"
          disabled={!name.trim() || name.trim() === group.name}
          onClick={() => save({ name: name.trim() }, 'Group renamed')}
        >
          Save
        </button>
      </div>

      {v4 && isOwner && !personal && (
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Who can find and join</span>
          <div className="segmented" role="radiogroup" aria-label="Who can see the group">
            <span
              className="segmented-thumb"
              aria-hidden="true"
              style={{ transform: `translateX(${group.visibility === 'public' ? 100 : 0}%)` }}
            />
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={(group.visibility ?? 'private') === v}
                className={(group.visibility ?? 'private') === v ? 'segmented-active' : ''}
                onClick={() =>
                  save(
                    v === 'public'
                      ? { visibility: v, join_mode: group.join_mode === 'open' ? 'open' : 'request' }
                      : { visibility: v, join_mode: 'invite' },
                    v === 'public' ? 'Now listed in Find a group' : 'Hidden from Find a group',
                  )
                }
              >
                {v === 'private' ? 'Private' : 'Public'}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {group.visibility === 'public'
              ? 'Its name, emoji and description show in Find a group. Places, ratings and notes stay inside the group.'
              : 'Only people with your code or invite link can join.'}
          </p>
          {group.visibility === 'public' && (
            <>
              <div className="flex flex-col gap-2">
                {JOIN_MODES.filter((m) => m.id !== 'invite').map((m) => (
                  <button
                    key={m.id}
                    className={`surface-soft text-left ${group.join_mode === m.id ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => save({ join_mode: m.id }, `${m.label}`)}
                  >
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.note}</span>
                  </button>
                ))}
              </div>
              <textarea
                className="field"
                aria-label="Group description"
                placeholder="A line about the group (shows in Find a group)"
                maxLength={160}
                defaultValue={group.description ?? ''}
                onBlur={(event) =>
                  event.target.value.trim() !== (group.description ?? '') &&
                  save({ description: event.target.value.trim() || null }, 'Description saved')
                }
              />
            </>
          )}
        </div>
      )}

      {v4 && !personal && (
        <div className="flex flex-col gap-2">
          <span className="font-semibold">People with your invite link</span>
          <div className="segmented" role="radiogroup" aria-label="People with your invite link">
            <span
              className="segmented-thumb"
              aria-hidden="true"
              style={{ transform: `translateX(${group.invite_approval ? 100 : 0}%)` }}
            />
            {([false, true] as const).map((approval) => (
              <button
                key={String(approval)}
                role="radio"
                aria-checked={!!group.invite_approval === approval}
                className={!!group.invite_approval === approval ? 'segmented-active' : ''}
                onClick={() =>
                  save(
                    { invite_approval: approval },
                    approval ? 'You’ll let each new person in' : 'Invite links let people straight in',
                  )
                }
              >
                {approval ? 'I let them in' : 'Join straight away'}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {group.invite_approval
              ? 'Opening your link lets them ask to join. They wait on the invite page until you (or an admin) tap Let in on the Group tab.'
              : 'Anyone who opens your invite link (or types the code) can join after signing in.'}
          </p>
        </div>
      )}

      {!v4 ? (
        <p className="surface-soft text-sm">
          More group settings (rating scale, category scores, whose turn, admins…) unlock with the
          next Crumbs update.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">Group look</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="field field-emoji"
                aria-label={`Group emoji: ${group.emoji ?? 'none'} (change)`}
                aria-expanded={picking}
                onClick={() => setPicking(!picking)}
              >
                {group.emoji ? <GroupBadge group={group} size={22} /> : '＋'}
              </button>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group colour">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    role="radio"
                    aria-checked={group.color === color}
                    aria-label={`Colour ${color}`}
                    className={`swatch !size-9 ${group.color === color ? 'swatch-on' : ''}`}
                    style={{ background: color }}
                    onClick={() => {
                      haptic('select')
                      save({ color })
                    }}
                  />
                ))}
              </div>
            </div>
            {picking && (
              <EmojiPicker
                value={group.emoji ?? null}
                color={group.color ?? null}
                onPick={(e) => {
                  haptic('select')
                  save({ emoji: e })
                  setPicking(false)
                }}
              />
            )}
            <span className="text-sm text-muted-foreground">Cover photo (top of the Group tab)</span>
            <PhotoButton
              aspect={2.2}
              label={`${group.name} cover`}
              path={group.cover_path}
              folder={group.id}
              supabase={supabase}
              demo={demo}
              onChange={async (cover_path) => {
                const before = group
                onGroup({ ...group, cover_path })
                const { error } = await supabase.from('groups').update({ cover_path }).eq('id', group.id)
                if (error) {
                  onGroup(before)
                  toast.error(error.message)
                  return false
                }
                return true
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-semibold">Rating scale</span>
            <div className="segmented segmented-3" role="radiogroup" aria-label="Rating scale">
              <span
                className="segmented-thumb"
                aria-hidden="true"
                style={{ transform: `translateX(${SCALES.findIndex((x) => x.id === s.scale) * 100}%)` }}
              />
              {SCALES.map((scale) => (
                <button
                  key={scale.id}
                  role="radio"
                  aria-checked={s.scale === scale.id}
                  className={s.scale === scale.id ? 'segmented-active' : ''}
                  onClick={() => {
                    haptic('tap')
                    setSetting({ scale: scale.id })
                  }}
                >
                  {scale.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Old ratings convert automatically; nobody has to re-rate.
            </span>
          </div>

          {(
            [
              ['categories', 'Category scores', 'Rate food, service, vibe and value separately.'],
              ['wouldReturn', '“Would go back?”', 'A quick yes / maybe / no on every rating.'],
              ['turns', 'Whose turn to pick', 'Crumbs tracks who chose last and who’s next.'],
              ['trips', 'Trips', 'Turn a list into a trip: city, dates, spend and its own map.'],
              ['home', 'Home cooking', 'The Home area for meals you cook yourselves.'],
              ['weather', 'Weather nudges', '“Rainy tonight — soup weather” for everyone.'],
            ] as const
          ).map(([key, label, hint]) => (
            <div className="settings-row" key={key}>
              <span>
                <span className="font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
              <Switch label={label} checked={s[key]} onChange={(on) => setSetting({ [key]: on })} />
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <span className="font-semibold">Vibe tags</span>
            <span className="text-sm text-muted-foreground">One-tap tags on every place page.</span>
            <div className="flex flex-wrap gap-2">
              {s.tags.map((tag) => (
                <span key={tag} className="chip chip-sm gap-1">
                  {tag}
                  <button
                    aria-label={`Remove ${tag}`}
                    onClick={() => setSetting({ tags: s.tags.filter((t) => t !== tag) })}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="field"
                aria-label="New vibe tag"
                placeholder="Add a tag (e.g. Brunch)"
                maxLength={24}
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || !newTag.trim()) return
                  setSetting({ tags: [...new Set([...s.tags, newTag.trim()])].slice(0, 16) })
                  setNewTag('')
                }}
              />
              <button
                className="secondary shrink-0"
                aria-label="Add tag"
                disabled={!newTag.trim()}
                onClick={() => {
                  setSetting({ tags: [...new Set([...s.tags, newTag.trim()])].slice(0, 16) })
                  setNewTag('')
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {!personal && (
          <>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">Members &amp; admins</span>
            {members.map((member) => {
              const role = member.id === group.created_by ? 'owner' : (member.role ?? 'member')
              return (
                <div key={member.id} className="surface-soft flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <strong>{member.display_name}</strong>
                    {member.id === userId ? ' (you)' : ''} <span className="tag ml-1">{role}</span>
                  </span>
                  {role !== 'owner' && member.id !== userId && (
                    <span className="flex shrink-0 gap-2">
                      {isOwner && (
                        <button
                          className="text-xs font-bold text-primary underline"
                          disabled={busy}
                          onClick={() =>
                            rpc(
                              'set_member_role',
                              {
                                target_group: group.id,
                                target_user: member.id,
                                new_role: role === 'admin' || role === 'guest' ? 'member' : 'admin',
                              },
                              role === 'guest'
                                ? `${member.display_name} is now a member`
                                : role === 'admin'
                                  ? `${member.display_name} is a member again`
                                  : `${member.display_name} is now an admin`,
                            )
                          }
                        >
                          {role === 'admin' || role === 'guest' ? 'Make member' : 'Make admin'}
                        </button>
                      )}
                      <button
                        className="text-xs font-bold text-destructive underline"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !(await askConfirm(`Remove ${member.display_name} from ${group.name}?`, {
                              confirm: 'Remove',
                              danger: true,
                            }))
                          )
                            return
                          rpc('remove_member', { target_group: group.id, target_user: member.id }, `Removed ${member.display_name}`)
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="settings-row">
            <span>
              <span className="font-semibold">Invite code: {group.join_code}</span>
              <span className="block text-sm text-muted-foreground">
                A new code stops old invite links and codes working.
              </span>
            </span>
            <button
              className="secondary shrink-0 !min-h-10 !px-3 text-sm"
              disabled={busy}
              onClick={async () => {
                if (
                  !(await askConfirm('Make a new invite code?', {
                    body: 'The old one stops working.',
                    confirm: 'New code',
                  }))
                )
                  return
                const code = await rpc('reset_join_code', { target_group: group.id }, 'New invite code made')
                if (typeof code === 'string') onGroup({ ...group, join_code: code })
              }}
            >
              New code
            </button>
          </div>
          {/* #135 view-only guests */}
          <div className="settings-row">
            <span>
              <span className="font-semibold">
                Guests (view only){group.guest_code ? `: ${group.guest_code}` : ''}
              </span>
              <span className="block text-sm text-muted-foreground">
                Guests see your places, ratings and lists but can’t change anything. Make one a
                member from the list above.
              </span>
              {group.guest_code && (
                <span className="mt-1 flex gap-3 text-sm">
                  <button
                    className="font-semibold text-primary underline"
                    onClick={async () => {
                      const link = inviteLink(group.guest_code!)
                      try {
                        if (navigator.share)
                          await navigator.share({ text: `Have a look at ${group.name} on Crumbs: ${link}` })
                        else {
                          await navigator.clipboard.writeText(link)
                          toast.success('Guest link copied')
                        }
                      } catch {}
                    }}
                  >
                    Share guest link
                  </button>
                  <button
                    className="text-muted-foreground underline"
                    onClick={async () => {
                      await rpc('guest_invite', { target_group: group.id, off: true }, 'Guest code turned off')
                      onGroup({ ...group, guest_code: null })
                    }}
                  >
                    Turn off
                  </button>
                </span>
              )}
            </span>
            <button
              className="secondary shrink-0 !min-h-10 !px-3 text-sm"
              disabled={busy}
              onClick={async () => {
                const code = await rpc('guest_invite', { target_group: group.id }, 'Guest code ready')
                if (typeof code === 'string') onGroup({ ...group, guest_code: code })
              }}
            >
              {group.guest_code ? 'New code' : 'Invite guests'}
            </button>
          </div>
          </>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Round 83: the group emoji. Sets to tap, or type any one emoji from the phone's keyboard (the
 * emoji keyboard opens from the field; anything that isn't a single emoji is refused).
 */
function EmojiPicker({
  value,
  color,
  onPick,
}: {
  value: string | null
  color: string | null
  onPick: (emoji: string | null) => void
}) {
  const [typed, setTyped] = useState('')
  const one = singleEmoji(typed)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          className="field text-center text-2xl"
          aria-label="Type any emoji"
          placeholder="Type any emoji"
          inputMode="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value.slice(-40))}
          onKeyDown={(event) => event.key === 'Enter' && one && onPick(one)}
        />
        <button
          type="button"
          className="primary shrink-0"
          disabled={!one}
          onClick={() => one && onPick(one)}
        >
          Use it
        </button>
      </div>
      {typed.trim() && !one && (
        <p className="text-sm text-muted-foreground">Just one emoji, please (no letters).</p>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase">Crumbs originals</span>
        <div className="badge-grid" role="radiogroup" aria-label="Crumbs badges">
          {CRUMBS_BADGES.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-label={b.label}
              aria-checked={value === badgeValue(b.id)}
              style={{ background: color ?? 'var(--primary)' }}
              onClick={() => onPick(badgeValue(b.id))}
            >
              <BadgeDrawing badge={b} size={22} />
            </button>
          ))}
        </div>
      </div>
      {EMOJI_SETS.map((set) => (
        <div key={set.label} className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase">{set.label}</span>
          <div className="emoji-grid" role="radiogroup" aria-label={`${set.label} emoji`}>
            {set.emoji.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={value === e}
                className={value === e ? 'emoji-on' : ''}
                onClick={() => onPick(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="emoji-none self-start" onClick={() => onPick(null)}>
        No emoji
      </button>
    </div>
  )
}

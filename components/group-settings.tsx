'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, GroupSettings, Profile } from '@/hooks/use-crumbs-data'
import { settingsOf, type Scale } from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { Switch } from './switch'

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
  const [name, setName] = useState(group.name)
  const [emoji, setEmoji] = useState(group.emoji ?? '')
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
        {isOwner ? 'You created' : 'You’re an admin of'} {group.name}. These apply to everyone in it.
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

      {!v4 ? (
        <p className="surface-soft text-sm">
          More group settings (rating scale, category scores, whose turn, admins…) unlock after the
          one-time database update has been run in Supabase.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">Group look</span>
            <div className="flex items-center gap-3">
              <input
                className="field field-emoji"
                aria-label="Group emoji"
                maxLength={4}
                placeholder="🍜"
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                onBlur={() => emoji !== (group.emoji ?? '') && save({ emoji: emoji.trim() || null })}
              />
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
                              { target_group: group.id, target_user: member.id, new_role: role === 'admin' ? 'member' : 'admin' },
                              role === 'admin' ? `${member.display_name} is a member again` : `${member.display_name} is now an admin`,
                            )
                          }
                        >
                          {role === 'admin' ? 'Make member' : 'Make admin'}
                        </button>
                      )}
                      <button
                        className="text-xs font-bold text-destructive underline"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Remove ${member.display_name} from ${group.name}?`)) return
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
                if (!window.confirm('Make a new invite code? The old one stops working.')) return
                const code = await rpc('reset_join_code', { target_group: group.id }, 'New invite code made')
                if (typeof code === 'string') onGroup({ ...group, join_code: code })
              }}
            >
              New code
            </button>
          </div>
        </>
      )}
    </section>
  )
}

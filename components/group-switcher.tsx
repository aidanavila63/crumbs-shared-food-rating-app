'use client'
// Your groups in one place: switch between them, start a new one, join with a code, or find a
// public group. Opened from the group name at the top of the app or under your name in Profile.
import { useEffect, useState } from 'react'
import { Check, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Group } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { oneEmoji } from '@/lib/group-look'
import { Overlay } from './overlay'

export type PublicGroup = {
  id: string
  name: string
  emoji: string | null
  color: string | null
  description: string | null
  join_mode: 'open' | 'request' | 'invite'
  members: number
  places: number
  is_member: boolean
  requested: boolean
}

export const JOIN_MODES: { id: 'invite' | 'open' | 'request'; label: string; note: string }[] = [
  { id: 'invite', label: 'Invite only', note: 'Only people with your code or link' },
  { id: 'request', label: 'Ask to join', note: 'Anyone can ask; the owner or an admin says yes' },
  { id: 'open', label: 'Open', note: 'Anyone can join straight away' },
]

const DEMO_PUBLIC: PublicGroup[] = [
  {
    id: 'demo-pub-1',
    name: 'Toronto Ramen Club',
    emoji: '🍜',
    color: '#7b2d5b',
    description: 'Slurping our way around the city.',
    join_mode: 'open',
    members: 12,
    places: 48,
    is_member: false,
    requested: false,
  },
  {
    id: 'demo-pub-2',
    name: 'Cheap Eats Downtown',
    emoji: '💸',
    color: '#2f6b4a',
    description: 'Under $15 a person, always.',
    join_mode: 'request',
    members: 31,
    places: 120,
    is_member: false,
    requested: false,
  },
]

export function GroupSwitcher({
  group,
  groups,
  supabase,
  demo,
  onSwitch,
  onCreated,
  onJoined,
  onClose,
}: {
  group: Group
  groups: Group[]
  supabase: any
  demo: boolean
  onSwitch: (group: Group) => void
  onCreated: (group: Group) => void
  onJoined: (group: Group) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'mine' | 'new' | 'join' | 'find'>('mine')
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [joinMode, setJoinMode] = useState<'invite' | 'open' | 'request'>('invite')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<PublicGroup[] | null>(null)

  async function create() {
    const clean = name.trim()
    if (!clean) return
    setBusy(true)
    try {
      let made: Group
      if (demo) {
        made = {
          ...group,
          id: crypto.randomUUID(),
          name: clean,
          emoji: null,
          cover_path: null,
          join_code: 'NEWGRP',
        }
      } else {
        const { data, error } = await supabase.rpc('create_group', { group_name: clean })
        if (error) throw error
        made = data
        if (visibility === 'public') {
          const changes = { visibility, join_mode: joinMode === 'invite' ? 'request' : joinMode }
          const { error: e2 } = await supabase.from('groups').update(changes).eq('id', made.id)
          if (!e2) made = { ...made, ...changes }
        }
      }
      haptic('success')
      toast.success(`${clean} created — invite people from the Group tab`)
      onCreated(made)
    } catch (error: any) {
      toast.error(error?.message || 'Could not create the group')
    } finally {
      setBusy(false)
    }
  }

  async function join() {
    if (code.length !== 6) return
    setBusy(true)
    try {
      if (demo) throw new Error('Joining needs the real database, not demo mode')
      const { data, error } = await supabase.rpc('join_group', { code })
      if (error) throw error
      haptic('success')
      toast.success(`Joined ${data.name}`)
      onJoined(data)
    } catch (error: any) {
      toast.error(error?.message || 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  async function search() {
    setBusy(true)
    try {
      if (demo) {
        const needle = q.trim().toLowerCase()
        setFound(DEMO_PUBLIC.filter((g) => !needle || g.name.toLowerCase().includes(needle)))
        return
      }
      const { data, error } = await supabase.rpc('public_groups', { q: q.trim() })
      if (error) throw error
      setFound(data ?? [])
    } catch (error: any) {
      toast.error(error?.message || 'Could not load public groups')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (mode === 'find' && found === null) search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  async function joinPublic(target: PublicGroup) {
    setBusy(true)
    try {
      if (demo) {
        setFound(
          (all) => all?.map((g) => (g.id === target.id ? { ...g, requested: true } : g)) ?? null,
        )
        return toast(target.join_mode === 'open' ? 'Joined (demo)' : 'Asked to join (demo)')
      }
      if (target.join_mode === 'open') {
        const { data, error } = await supabase.rpc('join_public_group', { target: target.id })
        if (error) throw error
        haptic('success')
        toast.success(`Joined ${data.name}`)
        onJoined(data)
      } else {
        const { error } = await supabase.rpc('request_to_join', { target: target.id })
        if (error) throw error
        haptic('success')
        toast.success('Asked to join — you’ll see it in your groups once they say yes')
        setFound(
          (all) => all?.map((g) => (g.id === target.id ? { ...g, requested: true } : g)) ?? null,
        )
      }
    } catch (error: any) {
      toast.error(error?.message || 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  const tabs: [typeof mode, string][] = [
    ['mine', 'Your groups'],
    ['new', 'New'],
    ['join', 'Code'],
    ['find', 'Find'],
  ]
  return (
    <Overlay label="Groups" title="Groups" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="chip-row" role="tablist" aria-label="Groups">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              className={`chip ${mode === id ? 'chip-active' : ''}`}
              onClick={() => {
                haptic('tap')
                setMode(id)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'mine' && (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                className={`surface flex items-center gap-3 text-left ${g.id === group.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => {
                  haptic('select')
                  onSwitch(g)
                }}
              >
                <span
                  className="group-badge"
                  style={{ background: g.color ?? undefined }}
                  aria-hidden="true"
                >
                  {oneEmoji(g.emoji) ?? g.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-xl font-bold">
                  {g.name}
                </span>
                {g.id === group.id && <Check size={18} className="text-primary" />}
              </button>
            ))}
            <div className="flex gap-2">
              <button className="secondary flex-1" onClick={() => setMode('new')}>
                <Plus size={16} /> New group
              </button>
              <button className="secondary flex-1" onClick={() => setMode('find')}>
                <Search size={16} /> Find a group
              </button>
            </div>
          </div>
        )}

        {mode === 'new' && (
          <div className="surface flex flex-col gap-3">
            <h3 className="font-serif text-2xl font-bold">Start a new group</h3>
            <input
              className="field"
              aria-label="Group name"
              placeholder="e.g. Friday food crew"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && create()}
            />
            <div className="segmented" role="radiogroup" aria-label="Who can see it">
              <span
                className="segmented-thumb"
                aria-hidden="true"
                style={{ transform: `translateX(${visibility === 'public' ? 100 : 0}%)` }}
              />
              {(['private', 'public'] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={visibility === v}
                  className={visibility === v ? 'segmented-active' : ''}
                  onClick={() => setVisibility(v)}
                >
                  {v === 'private' ? 'Private' : 'Public'}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {visibility === 'private'
                ? 'Only people you invite can find it.'
                : 'Its name shows in Find a group. What you save stays inside the group.'}
            </p>
            {visibility === 'public' && (
              <div className="flex flex-col gap-2">
                {JOIN_MODES.filter((m) => m.id !== 'invite').map((m) => (
                  <button
                    key={m.id}
                    className={`surface-soft text-left ${joinMode === m.id || (joinMode === 'invite' && m.id === 'request') ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setJoinMode(m.id)}
                  >
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.note}</span>
                  </button>
                ))}
              </div>
            )}
            <button className="primary" disabled={busy || !name.trim()} onClick={create}>
              {busy ? 'Creating…' : 'Create group'}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="surface flex flex-col gap-3">
            <h3 className="font-serif text-2xl font-bold">Join with a code</h3>
            <input
              className="field uppercase tracking-widest"
              aria-label="Join code"
              maxLength={6}
              placeholder="ABC123"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === 'Enter' && join()}
            />
            <button className="primary" disabled={busy || code.length !== 6} onClick={join}>
              Join group
            </button>
          </div>
        )}

        {mode === 'find' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                className="field"
                aria-label="Search public groups"
                placeholder="Search public groups"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && search()}
              />
              <button className="secondary shrink-0" disabled={busy} onClick={search}>
                <Search size={16} />
              </button>
            </div>
            {found === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : found.length === 0 ? (
              <p className="surface-soft text-sm">
                No public groups yet{q.trim() ? ' with that name' : ''}. Make yours public in its
                settings and it shows here.
              </p>
            ) : (
              found.map((g) => (
                <div key={g.id} className="surface flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="group-badge"
                      style={{ background: g.color ?? undefined }}
                      aria-hidden="true"
                    >
                      {oneEmoji(g.emoji) ?? g.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-xl font-bold">{g.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {g.members} member{g.members === 1 ? '' : 's'} · {g.places} place
                        {g.places === 1 ? '' : 's'}
                      </span>
                    </span>
                  </div>
                  {g.description && <p className="text-sm">{g.description}</p>}
                  <button
                    className={g.is_member || g.requested ? 'secondary' : 'primary'}
                    disabled={busy || g.is_member || g.requested}
                    onClick={() => joinPublic(g)}
                  >
                    {g.is_member
                      ? 'You’re in it'
                      : g.requested
                        ? 'Asked — waiting for a yes'
                        : g.join_mode === 'open'
                          ? 'Join'
                          : 'Ask to join'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Overlay>
  )
}

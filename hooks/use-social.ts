'use client'
// #11 Reactions + comments on ratings and feed items, and #45 the group feed itself.
// One small store per group, shared through context so any card can show a reaction bar.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

export type Reaction = { id: string; target: string; user_id: string; emoji: string }
export type Comment = {
  id: string
  target: string
  user_id: string
  body: string
  created_at: string
}
export type Activity = {
  id: string
  group_id: string
  actor: string | null
  kind:
    'place_added' | 'rated' | 'visited' | 'meal_added' | 'cooked' | 'joined' | 'planned' | string
  place_id: string | null
  meal_id: string | null
  detail: Record<string, any>
  created_at: string
}

export const REACTION_EMOJI = ['❤️', '😋', '🔥', '😂', '👀']

const demoNow = Date.now()
const demoActivity = (groupId: string): Activity[] => [
  {
    id: 'a1',
    group_id: groupId,
    actor: 'demo-partner',
    kind: 'rated',
    place_id: 'demo-taco',
    meal_id: null,
    detail: { score: 5 },
    created_at: new Date(demoNow - 2 * 36e5).toISOString(),
  },
  {
    id: 'a2',
    group_id: groupId,
    actor: 'demo-user',
    kind: 'cooked',
    place_id: null,
    meal_id: 'demo-meal-1',
    detail: {},
    created_at: new Date(demoNow - 26 * 36e5).toISOString(),
  },
  {
    id: 'a3',
    group_id: groupId,
    actor: 'demo-partner',
    kind: 'place_added',
    place_id: 'demo-place',
    meal_id: null,
    detail: { status: 'Want to try' },
    created_at: new Date(demoNow - 3 * 864e5).toISOString(),
  },
]

export function useSocialStore({
  groupId,
  userId,
  supabase,
  demo,
  v4,
}: {
  groupId?: string
  userId?: string
  supabase: any
  demo: boolean
  v4: boolean
}) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const enabled = !!groupId && (demo || v4)

  const load = useCallback(async () => {
    if (!groupId) return
    if (demo) {
      setActivity(demoActivity(groupId))
      setReactions([{ id: 'r1', target: 'activity:a1', user_id: 'demo-user', emoji: '🔥' }])
      setComments([
        {
          id: 'c1',
          target: 'activity:a1',
          user_id: 'demo-user',
          body: 'Told you the al pastor was the move',
          created_at: new Date(demoNow - 36e5).toISOString(),
        },
      ])
      return
    }
    if (!v4) return
    const [r, c, a] = await Promise.all([
      supabase
        .from('reactions')
        .select('id,target,user_id,emoji')
        .eq('group_id', groupId)
        .limit(2000),
      supabase
        .from('comments')
        .select('id,target,user_id,body,created_at')
        .eq('group_id', groupId)
        .order('created_at')
        .limit(1000),
      supabase
        .from('activity')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(80),
    ])
    if (!r.error) setReactions(r.data ?? [])
    if (!c.error) setComments(c.data ?? [])
    if (!a.error) setActivity(a.data ?? [])
  }, [demo, groupId, supabase, v4])

  useEffect(() => {
    setReactions([])
    setComments([])
    setActivity([])
    if (!enabled) return
    load()
    if (demo) return
    // Live: reactions/comments/feed arrive as your mates add them.
    const channel = supabase
      .channel(`social-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions', filter: `group_id=eq.${groupId}` },
        load,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `group_id=eq.${groupId}` },
        load,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity', filter: `group_id=eq.${groupId}` },
        load,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [demo, enabled, groupId, load, supabase])

  const toggleReaction = useCallback(
    async (target: string, emoji: string) => {
      if (!userId || !groupId) return
      const existing = reactions.find(
        (r) => r.target === target && r.user_id === userId && r.emoji === emoji,
      )
      const before = reactions
      if (existing) setReactions((current) => current.filter((r) => r.id !== existing.id))
      else
        setReactions((current) => [
          ...current,
          { id: crypto.randomUUID(), target, user_id: userId, emoji },
        ])
      if (demo) return
      const { error } = existing
        ? await supabase.from('reactions').delete().eq('id', existing.id)
        : await supabase
            .from('reactions')
            .insert({ group_id: groupId, target, user_id: userId, emoji })
      if (error) {
        setReactions(before)
        toast.error(error.message)
      }
    },
    [demo, groupId, reactions, supabase, userId],
  )

  const addComment = useCallback(
    async (target: string, body: string) => {
      const text = body.trim().slice(0, 500)
      if (!text || !userId || !groupId) return false
      const row: Comment = {
        id: crypto.randomUUID(),
        target,
        user_id: userId,
        body: text,
        created_at: new Date().toISOString(),
      }
      setComments((current) => [...current, row])
      if (demo) return true
      const { data, error } = await supabase
        .from('comments')
        .insert({ group_id: groupId, target, user_id: userId, body: text })
        .select('id,target,user_id,body,created_at')
        .single()
      if (error) {
        setComments((current) => current.filter((c) => c.id !== row.id))
        toast.error(error.message)
        return false
      }
      setComments((current) => current.map((c) => (c.id === row.id ? data : c)))
      return true
    },
    [demo, groupId, supabase, userId],
  )

  const removeComment = useCallback(
    async (id: string) => {
      const before = comments
      setComments((current) => current.filter((c) => c.id !== id))
      if (demo) return
      const { error } = await supabase.from('comments').delete().eq('id', id)
      if (error) {
        setComments(before)
        toast.error(error.message)
      }
    },
    [comments, demo, supabase],
  )

  return useMemo(
    () => ({
      enabled,
      userId,
      groupId,
      reactions,
      comments,
      activity,
      toggleReaction,
      addComment,
      removeComment,
      reload: load,
    }),
    [
      enabled,
      userId,
      groupId,
      reactions,
      comments,
      activity,
      toggleReaction,
      addComment,
      removeComment,
      load,
    ],
  )
}

export type SocialStore = ReturnType<typeof useSocialStore>

export const SocialContext = createContext<SocialStore | null>(null)
export const useSocial = () => useContext(SocialContext)

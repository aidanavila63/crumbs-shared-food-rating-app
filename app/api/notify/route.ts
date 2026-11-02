import webpush from 'web-push'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { cleanCode, isJoinCode } from '@/lib/invite'

export const runtime = 'nodejs'

// Sends a push notification to the other people in a group. Does nothing until the VAPID keys are set.
export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return Response.json({ sent: 0, reason: 'not-configured' })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user
  if (!me) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(`notify:${me.id}`, 40)) return Response.json({ sent: 0, reason: 'slow-down' })

  const body = await request.json().catch(() => ({}))
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', me.id)
    .maybeSingle()
  const who = (profile?.display_name || 'Your partner').split(' ')[0].slice(0, 30)
  let text: string | null = null
  let groupId = ''
  let tag = 'crumbs'
  // #137 @mentions: only the people mentioned (and only if they're in the same group)
  let only: string[] | null = null
  // Who to tell when it isn't "the rest of the group" (join requests go to the owner/admins).
  let fixed: string[] | null = null
  let db: any = supabase
  if (body.type === 'join_request') {
    // Someone asked to join from an invite link. They aren't in the group, so reading its
    // owner/admins needs the service key (server only); without it, nobody is told.
    const code = cleanCode(body.code)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!isJoinCode(code) || !serviceKey || !url) return Response.json({ sent: 0 })
    const { data: preview } = await supabase.rpc('invite_preview', { code })
    if (!preview?.requested) return Response.json({ sent: 0 })
    db = createServiceClient(url, serviceKey, { auth: { persistSession: false } })
    const { data: group } = await db
      .from('groups')
      .select('id,name')
      .or(`join_code.eq.${code},guest_code.eq.${code}`)
      .maybeSingle()
    if (!group) return Response.json({ sent: 0 })
    const { data: admins } = await db
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .in('role', ['owner', 'admin'])
    groupId = group.id
    fixed = (admins ?? []).map((row: any) => row.user_id)
    const asker = (profile?.display_name || 'Someone').split(' ')[0].slice(0, 30)
    text = `${asker} asked to join ${group.name} — tap Let in on the Group tab`
    tag = `crumbs-join-${group.id}`
  } else if (body.type === 'join_accepted') {
    // The owner/an admin let someone in: tell that person.
    const { data: mine } = await supabase
      .from('group_members')
      .select('role,groups(name)')
      .eq('group_id', String(body.groupId ?? ''))
      .eq('user_id', me.id)
      .maybeSingle()
    if (!mine || !['owner', 'admin'].includes(mine.role) || !Array.isArray(body.userIds))
      return Response.json({ sent: 0 })
    groupId = String(body.groupId)
    only = body.userIds.map(String).slice(0, 1)
    text = `${who} let you into ${(mine as any).groups?.name ?? 'the group'} 🎉`
    tag = `crumbs-join-${groupId}`
  } else if (body.type === 'mention') {
    const said = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const { data: member } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', String(body.groupId ?? ''))
      .eq('user_id', me.id)
      .maybeSingle()
    if (!said || !member || !Array.isArray(body.userIds)) return Response.json({ sent: 0 })
    groupId = String(body.groupId)
    only = body.userIds.map(String).slice(0, 10)
    text = `${who} mentioned you: “${said}”`
    tag = `crumbs-mention-${Date.now()}`
  } else if (body.type === 'craving') {
    // "I'm craving ___": no place involved, just make sure the sender is in that group.
    const what = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    const { data: member } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', String(body.groupId ?? ''))
      .eq('user_id', me.id)
      .maybeSingle()
    if (!what || !member) return Response.json({ sent: 0 })
    groupId = String(body.groupId)
    text = `${who} is craving ${what} 🤤`
    tag = 'crumbs-craving'
  } else {
    const { data: place } = await supabase
      .from('places')
      .select('id,name,group_id')
      .eq('id', String(body.placeId ?? ''))
      .maybeSingle()
    if (!place) return Response.json({ sent: 0 })
    groupId = place.group_id
    tag = `crumbs-${place.id}`
    const value = Number(body.value)
    const dish = String(body.dishName ?? '').slice(0, 60)
    if (body.type === 'place_added') text = `${who} added ${place.name} to your list`
    else if (body.type === 'place_rating' && value >= 1 && value <= 5)
      text = `${who} rated ${place.name} ${value}★`
    else if (body.type === 'dish_rating' && dish && value >= 0 && value <= 100)
      text = `${who} gave ${dish} ${value}/100 at ${place.name}`
  }
  if (!text) return Response.json({ sent: 0 })

  let others: string[]
  if (fixed) others = fixed.filter((id) => id !== me.id)
  else {
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
    others = (members ?? []).map((row: any) => row.user_id).filter((id: string) => id !== me.id)
  }
  if (only) others = others.filter((id: string) => only!.includes(id))
  // #73: skip people who switched this kind of notification off (column exists from v4).
  const kind =
    body.type === 'place_rating'
      ? 'rating'
      : body.type === 'place_added'
        ? 'place'
        : body.type === 'dish_rating'
          ? 'dish'
          : body.type === 'mention'
            ? 'mention'
            : body.type === 'join_request' || body.type === 'join_accepted'
              ? 'join'
              : 'craving'
  const { data: prefs, error: prefsError } = await db.from('profiles').select('id,notify').in('id', others)
  if (!prefsError && prefs) {
    const off = new Set(prefs.filter((row: any) => row.notify?.[kind] === false).map((row: any) => row.id))
    others = others.filter((id: string) => !off.has(id))
  }
  if (!others.length) return Response.json({ sent: 0 })
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', others)

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:crumbs@example.com',
    publicKey,
    privateKey,
  )
  const payload = JSON.stringify({ title: 'Crumbs', body: text, tag })
  let sent = 0
  await Promise.all(
    (subs ?? []).map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent += 1
      } catch (error: any) {
        // 404/410 means the phone unsubscribed; tidy it up.
        if (error?.statusCode === 404 || error?.statusCode === 410)
          await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }),
  )
  return Response.json({ sent })
}

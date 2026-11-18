import { webpush } from '@/lib/web-push'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { cleanCode, isJoinCode } from '@/lib/invite'
import { keepErrors } from '@/lib/server-errors'

export const runtime = 'nodejs'

// Sends a push notification to the other people in a group. Does nothing until the VAPID keys are set.
async function handlePOST(request: Request) {
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
  const who = (profile?.display_name || 'Someone in your group').split(' ')[0].slice(0, 30)
  let text: string | null = null
  let groupId = ''
  let tag = 'crumbs'
  // #137 @mentions: only the people mentioned (and only if they're in the same group)
  let only: string[] | null = null
  // Who to tell when it isn't "the rest of the group" (join requests go to the owner/admins).
  let fixed: string[] | null = null
  let db: any = supabase
  if (body.type === 'access_request' || body.type === 'access_answered') {
    // Getting into Crumbs itself: the asker isn't in any group yet, so reading the gatekeeper's
    // (or the asker's) phones needs the service key (server only); without it, nobody is told.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceKey || !url) return Response.json({ sent: 0 })
    const { data: access } = await supabase.rpc('my_access')
    const service = createServiceClient(url, serviceKey, { auth: { persistSession: false } })
    if (body.type === 'access_request') {
      // Someone asked to be let in: tell the gatekeeper (Aidan), or the admins if nobody is.
      if (!access?.asked || access.status !== 'pending') return Response.json({ sent: 0 })
      let { data: keepers } = await service.from('profiles').select('id').eq('lets_people_in', true)
      if (!keepers?.length)
        ({ data: keepers } = await service.from('profiles').select('id').eq('is_admin', true))
      const asker = (profile?.display_name || 'Someone').split(' ')[0].slice(0, 30)
      const sent = await deliver(
        service,
        (keepers ?? []).map((row: any) => row.id),
        'join',
        `${asker} wants to join Crumbs${access.group ? ` (invited to ${access.group})` : ''} — tap Let in on the Group tab`,
        'crumbs-access',
      )
      return Response.json({ sent })
    }
    // The gatekeeper said yes: tell the person, and if their group lets people in one by one,
    // tell that group's owner/admins they're now waiting.
    const person = String(body.userId ?? '')
    if (!access?.is_gatekeeper || !/^[0-9a-f-]{36}$/i.test(person)) return Response.json({ sent: 0 })
    const { data: them } = await service.from('profiles').select('access,display_name').eq('id', person).maybeSingle()
    if (them?.access !== 'approved') return Response.json({ sent: 0 })
    const group = String(body.group ?? '').slice(0, 60)
    let sent = await deliver(
      service,
      [person],
      'join',
      body.status === 'joined' && group
        ? `${who} let you into Crumbs — you’re in ${group} 🎉`
        : body.status === 'requested' && group
          ? `${who} let you into Crumbs 🎉 Now waiting for ${group}’s owner to let you in`
          : `${who} let you into Crumbs 🎉`,
      'crumbs-access',
    )
    if (body.status === 'requested' && body.groupId) {
      const gid = String(body.groupId)
      const { data: waiting } = await service
        .from('group_join_requests')
        .select('group_id,groups(name)')
        .eq('group_id', gid)
        .eq('user_id', person)
        .maybeSingle()
      if (waiting) {
        const { data: admins } = await service
          .from('group_members')
          .select('user_id')
          .eq('group_id', gid)
          .in('role', ['owner', 'admin'])
        const asker = (them.display_name || 'Someone').split(' ')[0].slice(0, 30)
        sent += await deliver(
          service,
          (admins ?? []).map((row: any) => row.user_id).filter((id: string) => id !== me.id),
          'join',
          `${asker} asked to join ${(waiting as any).groups?.name ?? 'your group'} — tap Let in on the Group tab`,
          `crumbs-join-${gid}`,
        )
      }
    }
    return Response.json({ sent })
  } else if (body.type === 'join_request') {
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
  } else if (body.type === 'reaction') {
    // Round 91: someone reacted to your rating, recipe or post. Only after they really reacted
    // (the row must exist), only to whoever it belongs to, and only within the group.
    const target = String(body.target ?? '').slice(0, 120)
    const emoji = String(body.emoji ?? '').slice(0, 8)
    const gid = String(body.groupId ?? '')
    const { data: reacted } = await supabase
      .from('reactions')
      .select('id')
      .eq('group_id', gid)
      .eq('target', target)
      .eq('user_id', me.id)
      .eq('emoji', emoji)
      .maybeSingle()
    if (!reacted) return Response.json({ sent: 0 })
    const [what, id] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)]
    let owners: string[] = []
    let about = ''
    if (what === 'meal') {
      const { data: meal } = await supabase.from('home_meals').select('name,created_by').eq('id', id).maybeSingle()
      if (meal?.created_by) owners = [meal.created_by]
      about = meal ? `your ${meal.name}` : ''
    } else if (what === 'rating') {
      const [{ data: place }, { data: raters }] = await Promise.all([
        supabase.from('places').select('name').eq('id', id).maybeSingle(),
        supabase.from('place_ratings').select('user_id').eq('place_id', id),
      ])
      owners = (raters ?? []).map((row: any) => row.user_id)
      about = place ? `your rating of ${place.name}` : ''
    } else if (what === 'activity') {
      const { data: item } = await supabase
        .from('activity')
        .select('actor,places(name),home_meals(name)')
        .eq('id', id)
        .eq('group_id', gid)
        .maybeSingle()
      if (item?.actor) owners = [item.actor]
      const name = (item as any)?.places?.name ?? (item as any)?.home_meals?.name
      about = item ? (name ? `your post about ${name}` : 'your post') : ''
    }
    owners = owners.filter((uid) => uid && uid !== me.id)
    if (!about || !owners.length) return Response.json({ sent: 0 })
    groupId = gid
    only = [...new Set(owners)].slice(0, 20)
    text = `${who} reacted ${emoji} to ${about}`
    tag = `crumbs-reaction-${target}`
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
            : body.type === 'reaction'
              ? 'reaction'
            : body.type === 'join_request' || body.type === 'join_accepted'
              ? 'join'
              : 'craving'
  // Round 74: phones' push keys are read with the server's own key, so nobody needs to be able to
  // read (or delete) a group-mate's keys. Without that key, fall back to the signed-in person's
  // access (which only reaches other people's keys before 20261114_audit_fixes.sql has run).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service =
    serviceKey && projectUrl
      ? createServiceClient(projectUrl, serviceKey, { auth: { persistSession: false } })
      : null
  // E25 (Round 86): with the server key, one database call finds the phones to send to (the group,
  // or the people named, minus you and anyone who switched this kind off).
  if (service) {
    const { data: targets, error } = await service.rpc('push_targets', {
      kind,
      target_group: fixed ? null : groupId,
      people: fixed ?? only,
      sender: me.id,
    })
    if (!error) return Response.json({ sent: await send(service, targets ?? [], text, tag) })
  }
  // Older database or no server key: the old way (members, then settings, then phones).
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
  const sent = await deliver(service ?? db, others, kind, text, tag)
  return Response.json({ sent })
}

/** Push `text` to these people's phones, skipping anyone who switched this kind off (#73). */
async function deliver(db: any, ids: string[], kind: string, text: string, tag: string) {
  let others = ids
  if (!others.length) return 0
  const { data: prefs, error: prefsError } = await db.from('profiles').select('id,notify').in('id', others)
  if (!prefsError && prefs) {
    const off = new Set(prefs.filter((row: any) => row.notify?.[kind] === false).map((row: any) => row.id))
    others = others.filter((id: string) => !off.has(id))
  }
  if (!others.length) return 0
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', others)
  return send(db, subs ?? [], text, tag)
}

/** Send to these phones; tidy up the ones that unsubscribed. */
async function send(
  db: any,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  text: string,
  tag: string,
) {
  if (!subs.length) return 0
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:crumbs.foodapp@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  const payload = JSON.stringify({ title: 'Crumbs', body: text, tag })
  let sent = 0
  await Promise.all(
    subs.map(async (sub: any) => {
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
  return sent
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const POST = keepErrors('POST /api/notify', handlePOST)

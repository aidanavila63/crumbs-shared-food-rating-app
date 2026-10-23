import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'

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
  if (body.type === 'craving') {
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

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
  const others = (members ?? []).map((row: any) => row.user_id).filter((id: string) => id !== me.id)
  if (!others.length) return Response.json({ sent: 0 })
  const { data: subs } = await supabase
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
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }),
  )
  return Response.json({ sent })
}

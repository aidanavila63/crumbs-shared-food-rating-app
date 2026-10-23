'use client'
// Tell the other person about something we just did (only works if push is set up).
const recent = new Map<string, number>()

export type NotifyPayload =
  | { type: 'place_added'; placeId: string }
  | { type: 'place_rating'; placeId: string; value: number }
  | { type: 'dish_rating'; placeId: string; dishName: string; value: number }

export function notifyMates(payload: NotifyPayload) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_DEMO_MODE === 'true')
    return
  const key = JSON.stringify([payload.type, payload.placeId, (payload as any).dishName])
  if (Date.now() - (recent.get(key) ?? 0) < 60_000) return
  recent.set(key, Date.now())
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)

export async function enablePush(supabase: any, userId: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed')
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    }))
  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: json.endpoint,
    user_id: userId,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  })
  if (error) throw error
}

export async function disablePush(supabase: any) {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

export async function pushIsOn() {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.ready
  return (
    Boolean(await registration.pushManager.getSubscription()) &&
    Notification.permission === 'granted'
  )
}

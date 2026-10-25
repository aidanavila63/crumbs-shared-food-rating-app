// #80 Photos on Cloudflare R2 (only when the R2_* settings are in Vercel). Hands out a short-lived
// upload link for a group you're in, and deletes files in your groups. The keys never reach the phone.
import { AwsClient } from 'aws4fetch'
import { createClient } from '@/lib/supabase/server'
import { r2Key } from '@/lib/photos'
import { tooManyRequests } from '@/lib/rate-limit'

const UUID = /^[0-9a-f-]{36}$/

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(`photos:${data.user.id}`, 60))
    return Response.json({ error: 'Slow down a little' }, { status: 429 })
  const store = r2()
  if (!store) return Response.json({ error: 'Photo storage isn’t set up' }, { status: 503 })
  const body = await request.json().catch(() => ({}))

  const target =
    body.op === 'upload' && typeof body.groupId === 'string' && UUID.test(body.groupId)
      ? { key: `${body.groupId}/${crypto.randomUUID()}.jpg`, groupId: body.groupId as string }
      : body.op === 'delete' && typeof body.path === 'string'
        ? r2Key(body.path)
        : null
  if (!target) return Response.json({ error: 'Bad request' }, { status: 400 })
  // Only for groups you're in (row-level security only shows your own memberships).
  const { data: member } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', target.groupId)
    .eq('user_id', data.user.id)
    .maybeSingle()
  if (!member) return Response.json({ error: 'Not your group' }, { status: 403 })

  const url = `${store.base}/${target.key}`
  if (body.op === 'delete') {
    await store.client.fetch(url, { method: 'DELETE' })
    return Response.json({ ok: true })
  }
  const signed = await store.client.sign(
    new Request(`${url}?X-Amz-Expires=600`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
    }),
    { aws: { signQuery: true } },
  )
  return Response.json({ url: signed.url, path: `r2/${target.key}` })
}

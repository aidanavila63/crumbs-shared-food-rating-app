// #80 Photos on Cloudflare R2 (only when the R2_* settings are in Vercel). Hands out short-lived
// upload links (the photo and its small copy) and deletes files. The keys never reach the phone.
// Round 77: a photo's folder says who it belongs to — a group you're a full member of (view-only
// guests can't add or remove: S15), yourself (profile photo), or a restaurant (tip / storefront
// photos anyone let in can add; only whoever added one, or a Crumbs admin, can remove it).
import { AwsClient } from 'aws4fetch'
import { createClient } from '@/lib/supabase/server'
import { r2Key } from '@/lib/photos'
import { tooManyRequests } from '@/lib/rate-limit'
import { gate } from '@/lib/server-gate'
import { keepErrors } from '@/lib/server-errors'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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

/** May this person add to (or, with `path`, remove from) this folder? */
async function allowed(supabase: any, userId: string, folder: string, path?: string) {
  if (folder === userId) return true
  const { data: member } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', folder)
    .eq('user_id', userId)
    .maybeSingle()
  if (member) return member.role !== 'guest'
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', folder)
    .maybeSingle()
  if (!restaurant) return false
  if (!path) return true
  // Removing a restaurant photo: fine when no one else's tip shows it (or you run Crumbs).
  const { data: tips } = await supabase
    .from('restaurant_tips')
    .select('user_id')
    .eq('photo_path', path)
  if (!(tips ?? []).some((tip: any) => tip.user_id !== userId)) return true
  const { data: me } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  return !!me?.is_admin
}

async function handlePOST(request: Request) {
  const supabase = await createClient()
  // E17 (Round 86): signed in + let in (+ switch) in one go
  const pass = await gate(supabase)
  if ('response' in pass) return pass.response
  const data = { user: { id: pass.userId } }
  if (tooManyRequests(`photos:${data.user.id}`, 60))
    return Response.json({ error: 'Slow down a little' }, { status: 429 })
  const store = r2()
  if (!store) return Response.json({ error: 'Photo storage isn’t set up' }, { status: 503 })
  const body = await request.json().catch(() => ({}))

  // `groupId` is what phones still on the previous version send.
  const folder = typeof body.folder === 'string' ? body.folder : body.groupId
  const id = crypto.randomUUID()
  const target =
    body.op === 'upload' && typeof folder === 'string' && UUID.test(folder)
      ? { key: `${folder}/${id}.jpg`, thumbKey: `${folder}/${id}.t.jpg`, folder: folder as string }
      : body.op === 'delete' && typeof body.path === 'string'
        ? r2Key(body.path)
        : null
  if (!target) return Response.json({ error: 'Bad request' }, { status: 400 })
  const ok = await allowed(
    supabase,
    data.user.id,
    target.folder,
    body.op === 'delete' ? body.path : undefined,
  )
  if (!ok) return Response.json({ error: 'You can’t change photos there' }, { status: 403 })

  if (body.op === 'delete') {
    await store.client.fetch(`${store.base}/${target.key}`, { method: 'DELETE' })
    await store.client.fetch(`${store.base}/${target.thumbKey}`, { method: 'DELETE' }).catch(() => {})
    return Response.json({ ok: true })
  }
  const sign = async (key: string) =>
    (
      await store.client.sign(
        new Request(`${store.base}/${key}?X-Amz-Expires=600`, {
          method: 'PUT',
          headers: { 'content-type': 'image/jpeg' },
        }),
        { aws: { signQuery: true } },
      )
    ).url
  return Response.json({
    url: await sign(target.key),
    thumbUrl: await sign(target.thumbKey),
    path: `r2/${target.key}`,
  })
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const POST = keepErrors('POST /api/photos', handlePOST)

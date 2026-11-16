// Round 77: Admin → Photos. Removes photo files nothing points at (B10) and saves small copies for
// photos from before small copies existed (E6). Admins only; the server key does the file work,
// and before deleting the server asks the database again which files are unused, so a list sent
// from the phone can never remove a photo that's in use.
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET } from '@/lib/photos'
import { keepErrors } from '@/lib/server-errors'

export const maxDuration = 60
const MAIN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/
const SMALL = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.t\.jpg$/

async function handlePOST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle()
  if (!me?.is_admin) return Response.json({ error: 'Admins only' }, { status: 403 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url)
    return Response.json({ error: 'Add SUPABASE_SERVICE_ROLE_KEY in Vercel first' }, { status: 503 })
  const db = createServiceClient(url, key, { auth: { persistSession: false } })

  // A small copy made on the admin's phone (it has the canvas; the server has no image tools).
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const form = await request.formData()
    const name = String(form.get('name') ?? '')
    const file = form.get('file')
    if (!MAIN.test(name) || !(file instanceof Blob) || file.size > 300_000)
      return Response.json({ error: 'Bad request' }, { status: 400 })
    const small = name.replace(/\.jpg$/, '.t.jpg')
    const { error } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(small, file, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
    if (error && !/exists/i.test(error.message))
      return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, saved: small })
  }

  const body = await request.json().catch(() => ({}))
  if (body.op !== 'delete' || !Array.isArray(body.names))
    return Response.json({ error: 'Bad request' }, { status: 400 })
  const asked = body.names
    .filter((n: unknown) => typeof n === 'string' && (MAIN.test(n) || SMALL.test(n)))
    .slice(0, 200) as string[]
  // Ask again, as this admin: only names still unused are removed.
  const { data: report, error } = await supabase.rpc('admin_photo_report', { sample: 5000 })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const unused = new Set<string>((report as any)?.orphan_names ?? [])
  const names = asked.filter((n) => unused.has(n))
  if (!names.length) return Response.json({ removed: 0, skipped: asked.length })
  const { error: removeError } = await db.storage.from(PHOTO_BUCKET).remove(names)
  if (removeError) return Response.json({ error: removeError.message }, { status: 500 })
  return Response.json({ removed: names.length, skipped: asked.length - names.length })
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const POST = keepErrors('POST /api/admin-photos', handlePOST)

// Round 78 (Privacy Policy: "your photos are deleted"): deleting your account removes the photo
// files you uploaded, not just the links to them. The database deletes the account (and clears
// the links) first, as you; then the server removes the files with its key. Without the server
// key the account is still deleted; the files become "unused" and Admin → Photos clears them.
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET } from '@/lib/photos'
import { keepErrors, logServerError } from '@/lib/server-errors'

async function handlePOST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const keepNotes = body.keepNotes !== false

  // Which files are yours (asked before the account is gone).
  const { data: files } = await supabase.rpc('my_photo_files')
  let { data: result, error } = await supabase.rpc('delete_my_account', { keep_notes: keepNotes })
  // Before the Round 78 SQL: the older function takes no choice.
  if (error && /keep_notes|function/i.test(error.message))
    ({ data: result, error } = await supabase.rpc('delete_my_account'))
  if (error) return Response.json({ error: error.message }, { status: 400 })

  let removed = 0
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const names = ((files ?? []) as string[]).filter((n) => typeof n === 'string')
  if (key && url && names.length) {
    const db = createServiceClient(url, key, { auth: { persistSession: false } })
    const small = names.map((n) => n.replace(/\.jpg$/, '.t.jpg')).filter((n) => !names.includes(n))
    const all = [...names, ...small]
    for (let i = 0; i < all.length; i += 100) {
      const { error: removeError } = await db.storage.from(PHOTO_BUCKET).remove(all.slice(i, i + 100))
      if (removeError) await logServerError('POST /api/delete-account (photos)', removeError)
      else removed += Math.min(100, all.length - i)
    }
  }
  await supabase.auth.signOut().catch(() => {})
  return Response.json({ ok: true, photos: removed, keptNotes: keepNotes, ...(result ?? {}) })
}

export const POST = keepErrors('POST /api/delete-account', handlePOST)

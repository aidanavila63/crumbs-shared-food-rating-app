// Server-side check for admin feature switches (#109), so a switch set to "Admin" or "Off"
// can't be bypassed by calling the API directly. Missing table/row = allowed (today's behaviour).
export async function flagAllows(supabase: any, key: string, userId: string) {
  const { data: flag, error } = await supabase
    .from('feature_flags')
    .select('state')
    .eq('key', key)
    .maybeSingle()
  if (error || !flag || flag.state === 'everyone') return true
  if (flag.state === 'off') return false
  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()
  return !!me?.is_admin
}

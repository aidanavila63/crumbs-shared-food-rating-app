// Server-side check for admin feature switches (#109), so a switch set to "Admin" or "Off"
// can't be bypassed by calling the API directly. A switch nobody added = allowed. Round 74: if the
// check itself fails (database hiccup) the answer is no, so an "Off" switch can't be slipped past.
export async function flagAllows(supabase: any, key: string, userId: string) {
  const { data: flag, error } = await supabase
    .from('feature_flags')
    .select('state')
    .eq('key', key)
    .maybeSingle()
  if (error) return false
  if (!flag || flag.state === 'everyone') return true
  if (flag.state === 'off') return false
  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()
  return !!me?.is_admin
}

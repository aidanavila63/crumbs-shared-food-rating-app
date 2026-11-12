// Round 76: the server routes check that the signed-in person has actually been let into Crumbs
// (the gatekeeper's OK), not just that they have an account. Someone still waiting could otherwise
// call these routes directly and use up AI, website and map-search allowances.
// The database answers (is_let_in, from 20261102_invites_approval.sql). If that function doesn't
// exist yet (PGRST202: the SQL file hasn't run) there is no gate, so everyone signed in passes;
// any other failure means "no".
export async function isLetIn(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_let_in', { uid: userId })
    if (error) return error.code === 'PGRST202'
    return data === true
  } catch {
    return false
  }
}

export const NOT_LET_IN = { error: 'Crumbs hasn’t let you in yet' }

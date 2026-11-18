// E17 (Round 86): the check at the top of every server route — signed in, let into Crumbs, and
// (optionally) a feature switch on — in as few round trips as possible:
//  - who you are comes from the sign-in token, verified on the server (getClaims; with Supabase's
//    newer signing keys this needs no call to the sign-in server at all, otherwise it asks it once)
//  - "still an account, let in, switch on" is one database call (request_gate).
// Before 20261123_round86.sql has run, it falls back to the old separate checks.
import { isLetIn, NOT_LET_IN } from './let-in.ts'
import { flagAllows } from './flags-server.ts'

export type Gate = { userId: string } | { response: Response }
export type GateAnswer = { signed_in?: boolean; let_in?: boolean; flag_ok?: boolean } | null

const signIn = () => Response.json({ error: 'Please sign in first' }, { status: 401 })

/** Who's asking (verified), or null. */
export async function whoIsAsking(supabase: any): Promise<string | null> {
  try {
    if (typeof supabase.auth.getClaims === 'function') {
      const { data, error } = await supabase.auth.getClaims()
      if (!error && typeof data?.claims?.sub === 'string') return data.claims.sub
      if (!error) return null
    }
  } catch {
    // fall through to getUser
  }
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

/** What the gate's answer means for the route (pure, so it can be tested). */
export function gateResponse(answer: GateAnswer, flagMessage?: string): Response | null {
  if (!answer?.signed_in) return signIn()
  if (!answer.let_in) return Response.json(NOT_LET_IN, { status: 403 })
  if (answer.flag_ok === false)
    return Response.json({ error: flagMessage ?? 'That’s switched off for now' }, { status: 403 })
  return null
}

export async function gate(supabase: any, flag?: { key: string; off: string }): Promise<Gate> {
  const userId = await whoIsAsking(supabase)
  if (!userId) return { response: signIn() }
  const { data, error } = await supabase.rpc('request_gate', { flag_key: flag?.key ?? null })
  if (!error) {
    const stop = gateResponse(data as GateAnswer, flag?.off)
    return stop ? { response: stop } : { userId }
  }
  // Older database (or a hiccup): the separate checks, each of which says "no" on a hiccup.
  if (error.code !== 'PGRST202') return { response: Response.json(NOT_LET_IN, { status: 403 }) }
  if (!(await isLetIn(supabase, userId)))
    return { response: Response.json(NOT_LET_IN, { status: 403 }) }
  if (flag && !(await flagAllows(supabase, flag.key, userId)))
    return { response: Response.json({ error: flag.off }, { status: 403 }) }
  return { userId }
}

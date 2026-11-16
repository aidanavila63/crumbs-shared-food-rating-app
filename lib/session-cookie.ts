// E15 (Round 77): used by proxy.ts to send signed-out visitors the landing page directly.
/** Signed in on this browser? (Supabase keeps the session in "sb-<project>-auth-token" cookies.) */
export function hasSession(cookieNames: string[]) {
  return cookieNames.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
}

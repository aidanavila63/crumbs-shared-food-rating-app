// S8 (Round 77): Cloudflare Turnstile (free bot check). The site key is public; the secret stays on the server.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

/** Asks Cloudflare whether the answer from the phone is real. */
export async function verifyTurnstile(token: string, secret: string, ip?: string | null) {
  const form = new URLSearchParams({ secret, response: token })
  if (ip) form.set('remoteip', ip)
  const answer = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
    .then((r) => r.json())
    .catch(() => null)
  return !!answer?.success
}

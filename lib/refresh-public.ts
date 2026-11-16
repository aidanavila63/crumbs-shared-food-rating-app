// E14 (Round 77): ask for the kept public pages to be rebuilt after a change (see /api/revalidate).
export function refreshPublicPages(kind: 'restaurant' | 'profile') {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return
  fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind }),
    keepalive: true,
  }).catch(() => {})
}

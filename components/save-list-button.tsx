'use client'
// U11 (Round 95): "Save to my Crumbs" on a shared list page. Remembers the list (for an hour) so it
// still gets saved after signing in.
import { rememberPendingList } from '@/lib/pending-add'

export function SaveListButton({ token }: { token: string }) {
  return (
    <a className="primary text-center" href={`/?addlist=${token}`} onClick={() => rememberPendingList(token)}>
      Save to my Crumbs
    </a>
  )
}

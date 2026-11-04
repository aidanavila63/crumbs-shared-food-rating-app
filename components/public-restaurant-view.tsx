'use client'
// /r/<city>/<name> for whoever opens the link. Strangers read it; "Save to try" and "Log a visit"
// need Crumbs, so signed-out visitors are sent to sign in first (and what they wanted is remembered).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Toaster } from 'sonner'
import { RestaurantPage } from './restaurant-page'
import { Wordmark } from './wordmark'
import { createClient } from '@/lib/supabase'
import { addLink, rememberPendingAdd } from '@/lib/pending-add'
import type { PublicRestaurant } from '@/lib/public-page'

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export function PublicRestaurantView({ data }: { data: PublicRestaurant }) {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    if (demo) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: auth }) => setUid(auth.user?.id ?? null))
  }, [])
  const join = () => {
    rememberPendingAdd(data.id)
    router.push(addLink(data.id))
  }
  async function report(text: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('feedback')
      .insert({ user_id: uid, body: text, page: `report:${data.city}/${data.slug}` })
    if (error) throw error
  }
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-16">
      <Link href="/" aria-label="Crumbs home" className="self-start">
        <Wordmark height={26} />
      </Link>
      <RestaurantPage data={data} onSave={join} onLog={join} onReport={uid ? report : undefined} />
      <footer className="mt-2 rounded-3xl bg-muted p-4 text-center text-sm">
        <p className="font-semibold">Crumbs is a shared food map for you and your people.</p>
        <p className="mt-1 text-muted-foreground">Rate places together, keep a want-to-try list, decide where to eat.</p>
        <Link className="primary mt-3 w-full" href="/">Open Crumbs</Link>
      </footer>
      <Toaster position="top-center" richColors />
    </main>
  )
}

import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'

// Third pass #8: a Crumbs page for links that go nowhere (an old restaurant address, a typo),
// instead of the plain framework page.
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <div className="surface w-full max-w-sm text-center">
        <div className="flex justify-center">
          <Wordmark height={34} />
        </div>
        <p className="mt-8 text-5xl" aria-hidden="true">
          🍽️
        </p>
        <h1 className="mt-4 font-serif text-3xl font-bold">Nothing on this plate</h1>
        <p className="mt-3 leading-6 text-muted-foreground">
          That page doesn’t exist (or moved). A restaurant’s page may have a new address.
        </p>
        <Link href="/" className="primary mt-6 block">
          Open Crumbs
        </Link>
      </div>
    </main>
  )
}

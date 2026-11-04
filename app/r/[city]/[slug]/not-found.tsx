import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <h1 className="mt-16 font-serif text-3xl font-bold">We couldn&apos;t find that restaurant</h1>
      <p className="mt-3 text-muted-foreground">The link may have changed, or it isn&apos;t on Crumbs yet.</p>
      <Link className="primary mt-6" href="/">Open Crumbs</Link>
    </main>
  )
}

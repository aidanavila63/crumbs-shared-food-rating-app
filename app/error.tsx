'use client'
import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface w-full max-w-sm text-center">
        <p className="text-4xl">🍞</p>
        <h1 className="mt-3 font-serif text-2xl font-bold">Something crumbled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your places are safe. Try again, and if it keeps happening, reload the app.
        </p>
        <button className="primary mt-5 w-full" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  )
}

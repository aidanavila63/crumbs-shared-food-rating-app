// Round 78: the frame around /terms, /privacy, /owner-terms and /credits.
import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { LEGAL_DRAFT } from '@/lib/legal-text'

export const LEGAL_LINKS = [
  ['/terms', 'Terms'],
  ['/privacy', 'Privacy'],
  ['/owner-terms', 'Owner terms'],
  ['/credits', 'Credits'],
] as const

/** A small row of links for the bottom of any page (sign-in card, landing, public pages, Settings). */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Terms and credits" className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}>
      {LEGAL_LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="underline">
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function LegalPage({ children, draft = LEGAL_DRAFT }: { children: React.ReactNode; draft?: boolean }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="Crumbs home">
            <Wordmark height={32} />
          </Link>
          <Link href="/" className="text-sm font-semibold text-primary underline">
            Open Crumbs
          </Link>
        </header>
        {draft && (
          <p role="note" className="site-notice site-notice-warn mb-0">
            Draft — Crumbs is invite-only while this is finished. Text in [square brackets] is still
            being decided. Questions: crumbs.foodapp@gmail.com
          </p>
        )}
        <article className="surface">{children}</article>
        <LegalLinks />
      </div>
    </main>
  )
}

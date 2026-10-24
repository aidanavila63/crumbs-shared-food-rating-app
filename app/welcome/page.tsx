import type { Metadata } from 'next'
import Link from 'next/link'
import { Utensils } from 'lucide-react'
import { WaitlistForm } from '@/components/waitlist-form'

// #94 Public "what is Crumbs" page + waitlist, for people who haven't been invited yet.
export const metadata: Metadata = {
  title: 'Crumbs — rate food together',
  description:
    'A shared food map for couples and friends: rate places together, decide where to eat, plan dinners and remember the good ones.',
  openGraph: {
    title: 'Crumbs — rate food together',
    description: 'Rate places together, decide where to eat, and remember the good ones.',
  },
}

const FEATURES = [
  [
    '⭐',
    'Rate together',
    'Everyone scores places and dishes. Blind ratings keep you honest until you’ve both rated.',
  ],
  [
    '💘',
    'Decide together',
    'Swipe yes or no on your want-to-try list. Places you all like are a match.',
  ],
  [
    '🗺️',
    'Your food map',
    'Every place you’ve been and want to try, on one map. Plan food crawls with walking times.',
  ],
  [
    '📅',
    'Plan dinners',
    'Pick a time and place, everyone says if they’re in, add it to your calendar.',
  ],
  ['🏠', 'Home cooking', 'Rate what you cook too, keep the recipe link, and see whose turn it is.'],
  ['🏆', 'Memories', 'Streaks, badges, a cuisine passport and “a year ago today” moments.'],
]

export default function Welcome() {
  return (
    <main className="welcome min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Utensils />
            </div>
            <span className="font-serif text-2xl font-bold">crumbs</span>
          </div>
          <Link href="/" className="text-sm font-semibold text-primary underline">
            Sign in
          </Link>
        </header>

        <section className="welcome-hero flex flex-col gap-4">
          <p className="tag w-fit">Invite-only for now</p>
          <h1 className="font-serif text-5xl font-bold leading-[1.05] sm:text-6xl">
            Your group’s
            <br />
            food map.
          </h1>
          <p className="max-w-xl text-lg leading-7 text-muted-foreground">
            Crumbs is where you and your people keep every restaurant you love, every dish worth
            ordering again, and every “we should try that place” — and finally decide where to eat.
          </p>
          <a href="#waitlist" className="primary w-fit px-6">
            Join the waitlist
          </a>
        </section>

        <section className="stagger grid gap-3 sm:grid-cols-2" aria-label="What you can do">
          {FEATURES.map(([emoji, title, body]) => (
            <div key={title} className="surface flex gap-3">
              <span className="category-emoji" aria-hidden="true">
                {emoji}
              </span>
              <div>
                <h2 className="font-serif text-xl font-bold">{title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="surface flex flex-col gap-3">
          <h2 className="font-serif text-3xl font-bold">How it works</h2>
          <ol className="flex flex-col gap-2 text-base">
            <li>
              <strong>1.</strong> Make a group and share the invite link (or QR code).
            </li>
            <li>
              <strong>2.</strong> Add places from the map or search, and rate them after you go.
            </li>
            <li>
              <strong>3.</strong> When you can’t decide, swipe — or let Crumbs surprise you.
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Works on any phone as an app (add it to your home screen). Free while we grow.
          </p>
        </section>

        <section id="waitlist" className="flex scroll-mt-6 flex-col gap-3">
          <h2 className="font-serif text-3xl font-bold">Get in early</h2>
          <p className="text-muted-foreground">
            We’re letting people in a few groups at a time. Leave your email and we’ll send you an
            invite.
          </p>
          <WaitlistForm />
        </section>

        <footer className="pb-8 text-center text-sm text-muted-foreground">
          Already have an invite link? Just open it. ·{' '}
          <Link href="/" className="underline">
            Sign in
          </Link>
        </footer>
      </div>
    </main>
  )
}

// Round 76: what Crumbs is, shown to everyone who isn't signed in BEFORE any sign-in box — at the
// app's own address (/) and at /welcome. Signing in is one tap away ("Sign in"), and the page says
// plainly that each new person is let in by hand. No hooks here, so both a server page (/welcome)
// and the app itself can show it; `onSignIn` is only passed by the app.
import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { WaitlistForm } from '@/components/waitlist-form'
import { ExpiredLinkRedirect } from '@/components/expired-link-redirect'

const FEATURES = [
  ['📍', 'Your own food map', 'Every place you’ve been and want to try, with your scores, notes and photos. Yours first — it works with nobody else in it.'],
  ['⭐', 'Rate places and dishes', 'Stars for the place, points for each dish, and a “must try” for the ones worth ordering again.'],
  ['👥', 'Better with your people', 'Share a group with a partner, friends, family or the lunch crew at work. Everyone rates; blind ratings keep it honest.'],
  ['💘', 'Decide where to eat', 'Swipe yes or no, spin the wheel, or let Crumbs pick from what’s open near you. Places you all like are a match.'],
  ['📅', 'Plan it', 'Pick a time and place, see who’s in, add it to your calendar. Food crawls come with walking times.'],
  ['🏠', 'Home cooking too', 'Keep the recipes you cook, rate them, and share the good ones.'],
  ['🏆', 'Remember it', 'Streaks, badges, a cuisine passport, “a year ago today”, and a year-in-food recap.'],
  ['🔒', 'Private by default', 'What you add is seen by you and the groups you choose. No ads, and nothing is sold.'],
] as const

const STEPS = [
  ['Ask to join', 'Sign in with Google or your email and ask. Every new person is approved by hand before they can use Crumbs — with or without an invite link — usually within a day.'],
  ['Add your places', 'Search or tap the map, bring in a saved list from your maps app, or just log where you ate tonight.'],
  ['Bring people in', 'Start a group and share its link or QR code — or keep it to yourself.'],
] as const

export function Landing({ onSignIn }: { onSignIn?: () => void }) {
  const signIn = (label: string, className: string) =>
    onSignIn ? (
      <button className={className} onClick={onSignIn}>
        {label}
      </button>
    ) : (
      <Link href="/?signin=1" className={className}>
        {label}
      </Link>
    )
  return (
    <main className="welcome min-h-screen bg-background">
      <ExpiredLinkRedirect />
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <Wordmark height={38} />
          {signIn('Sign in', 'text-sm font-semibold text-primary underline')}
        </header>

        <section className="welcome-hero flex flex-col gap-4">
          <p className="tag w-fit">Everyone is approved by hand for now</p>
          <h1 className="font-serif text-5xl font-bold leading-[1.05] sm:text-6xl">
            Everywhere you eat,
            <br />
            in one place.
          </h1>
          <p className="max-w-xl text-lg leading-7 text-muted-foreground">
            Crumbs keeps every restaurant you love, every dish worth ordering again and every “we
            should try that place” — for yourself, and with the people you eat with. Then it helps
            you decide where to go.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#waitlist" className="primary w-fit px-6">
              Join the waitlist
            </a>
            {signIn('Sign in or ask to join', 'secondary w-fit px-5')}
          </div>
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
          <ol className="flex flex-col gap-3 text-base">
            {STEPS.map(([title, body], index) => (
              <li key={title}>
                <strong>
                  {index + 1}. {title}.
                </strong>{' '}
                <span className="text-muted-foreground">{body}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Works on any phone like an app (add it to your home screen). Free.
          </p>
        </section>

        <section id="waitlist" className="flex scroll-mt-6 flex-col gap-3">
          <h2 className="font-serif text-3xl font-bold">Get in early</h2>
          <p className="text-muted-foreground">
            People are let in a few at a time. Leave your email and you’ll get one message when
            there’s a spot — nothing else.
          </p>
          <WaitlistForm />
        </section>

        <footer className="flex flex-col items-center gap-2 pb-8 text-center text-sm text-muted-foreground">
          <p>
            An invite link from a friend doesn’t skip the wait: you still ask, and you’re approved by
            hand like everyone else. Opening it just means you land in their group afterwards.
          </p>
          {signIn('Sign in', 'underline')}
        </footer>
      </div>
    </main>
  )
}

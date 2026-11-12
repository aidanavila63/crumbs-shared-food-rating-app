import type { Metadata } from 'next'
import { Landing } from '@/components/landing'

// #94 Public "what is Crumbs" page + waitlist, for people who haven't been invited yet.
export const metadata: Metadata = {
  title: 'Crumbs — everywhere you eat, in one place',
  description:
    'Your own food map, better with your people: keep the places and dishes you love, rate them, decide where to eat, plan dinners and remember the good ones.',
  openGraph: {
    title: 'Crumbs — everywhere you eat, in one place',
    description: 'Rate places together, decide where to eat, and remember the good ones.',
  },
}

export default function Welcome() {
  return <Landing />
}

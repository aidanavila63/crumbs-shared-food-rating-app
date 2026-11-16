import type { Metadata, Viewport } from 'next'
import { Figtree, Fredoka, Young_Serif } from 'next/font/google'
import { SwRegister } from '@/components/sw-register'
import { OfflineBanner } from '@/components/offline-banner'
import { EARLY_PREFS_SCRIPT } from '@/lib/early-prefs'
import { siteUrl } from '@/lib/site'
import './globals.css'
import './polish.css'

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' })
const youngSerif = Young_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-young-serif',
})
// Brand lettering (posters, invite cards). Not preloaded: it's only fetched when a poster is drawn.
const fredoka = Fredoka({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-fredoka',
  preload: false,
})

export const metadata: Metadata = {
  // Round 77: link previews use the site's real address (NEXT_PUBLIC_SITE_URL, lib/site.ts).
  metadataBase: new URL(siteUrl()),
  title: 'Crumbs — your food map, for you and your people',
  description: 'A food map for the places you love and the ones you want to try — yours, and shared with the people you eat with.',
  openGraph: {
    title: 'Crumbs',
    description: 'Save places, rate dishes, decide where to eat. For you, and the people you eat with.',
    siteName: 'Crumbs',
    type: 'website',
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-light-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  appleWebApp: { capable: true, title: 'Crumbs', statusBarStyle: 'default' },
}
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF3EE' },
    { media: '(prefers-color-scheme: dark)', color: '#111A15' },
  ],
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the early script below sets data-theme/accent/motion before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY_PREFS_SCRIPT }} />
      </head>
      <body className={`${figtree.variable} ${youngSerif.variable} ${fredoka.variable}`}>
        {children}
        <OfflineBanner />
        <SwRegister />
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import { Figtree, Young_Serif } from 'next/font/google'
import { SwRegister } from '@/components/sw-register'
import { OfflineBanner } from '@/components/offline-banner'
import { EARLY_PREFS_SCRIPT } from '@/lib/early-prefs'
import './globals.css'
import './polish.css'

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' })
const youngSerif = Young_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-young-serif',
})

export const metadata: Metadata = {
  title: 'Crumbs — your group food map',
  description: 'A shared food map for the places you love and the ones you want to try.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
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
      <body className={`${figtree.variable} ${youngSerif.variable}`}>
        {children}
        <OfflineBanner />
        <SwRegister />
      </body>
    </html>
  )
}

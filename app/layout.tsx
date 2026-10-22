import type { Metadata, Viewport } from 'next'
import { Figtree, Young_Serif } from 'next/font/google'
import { SwRegister } from '@/components/sw-register'
import './globals.css'

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
  maximumScale: 1,
  userScalable: false,
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${youngSerif.variable}`}>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}

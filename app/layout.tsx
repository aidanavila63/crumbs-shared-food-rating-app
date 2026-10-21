import type { Metadata, Viewport } from 'next'
import { Figtree, Young_Serif } from 'next/font/google'
import './globals.css'

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' })
const youngSerif = Young_Serif({ weight: '400', subsets: ['latin'], variable: '--font-young-serif' })

export const metadata: Metadata = { title: 'Crumbs — your group food map', description: 'A shared food map for the places you love and the ones you want to try.', manifest: '/manifest.webmanifest', icons: { icon: '/icon.svg' } }
export const viewport: Viewport = { themeColor: '#EEF3EE', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={`${figtree.variable} ${youngSerif.variable}`}>{children}</body></html> }

import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { LegalMarkdown } from '@/components/legal-markdown'

// Round 78: where Crumbs' map data, services and building blocks come from (the audit's legal
// route: open data needs its credit shown in one findable place, not only in corners).
export const metadata: Metadata = {
  title: 'Credits · Crumbs',
  description: 'The map data, services and open-source building blocks Crumbs uses.',
}

const CREDITS = `## Credits

Crumbs is built by Aidan Avila in Toronto with the help of a lot of other people's work.

### Map and place data

- **OpenStreetMap** — place details, search and "what's nearby" come partly from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, available under the Open Database Licence (ODbL). The fallback map uses OpenStreetMap's tiles.
- **Overture Maps Foundation** — many restaurants in the Greater Toronto Area (names, addresses, phone numbers, websites, kinds of food) come from [Overture Maps](https://overturemaps.org) places data, available under the Community Data License Agreement – Permissive 2.0 (CDLA-Permissive-2.0). Overture gathers it from Meta, Microsoft, Foursquare Open Source Places (Apache 2.0), AllThePlaces (CC0) and others.
- **Photon** by Komoot — search over OpenStreetMap data ([photon.komoot.io](https://photon.komoot.io)).
- **Nominatim** and **Overpass** — OpenStreetMap's address lookup and data queries.
- **Google Maps Platform** — the main map and some place search. Google's own credit shows on the map. Some place details still come from Google; Crumbs is replacing them with open data and what members add.
- **Restaurants' own websites** — some hours, menus and booking links are read from the restaurant's website, and the page says so.
- **Members of Crumbs** — most of all: the details, menus and corrections people add.

### Weather

- **Open-Meteo** — weather for the "good day for a patio" nudges ([open-meteo.com](https://open-meteo.com)), CC BY 4.0.

### Services that run Crumbs

- **Supabase** (database, sign-in, photo storage), **Vercel** (hosting), and, when switched on, **Cloudflare** (photo storage, backups and the bot check). See the [Privacy Policy](/privacy) for what each one receives.

### Open-source building blocks

- **Next.js** and **React** (MIT), **Tailwind CSS** (MIT), **Lucide** icons (ISC), **Leaflet** (BSD-2-Clause), **Tesseract.js** for reading receipts and menus on your phone (Apache-2.0), **Sonner** (MIT), **qrcode** (MIT), **fflate** (MIT), **web-push** (MPL-2.0), and the Vercel AI SDK (Apache-2.0).
- Fonts: **Figtree**, **Young Serif** and **Fredoka**, all under the SIL Open Font License.

Spotted something missing? Email crumbs.foodapp@gmail.com.
`

export default function Page() {
  return (
    <LegalPage draft={false}>
      <LegalMarkdown md={CREDITS} />
    </LegalPage>
  )
}

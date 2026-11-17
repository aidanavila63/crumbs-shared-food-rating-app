import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { LegalMarkdown } from '@/components/legal-markdown'
import { OWNER_TERMS_MD } from '@/lib/legal-text'

// Round 78: built once at deploy time from lib/legal-text.ts.
export const metadata: Metadata = {
  title: 'Terms for restaurant owners · Crumbs',
  description: 'Extra terms for people who claim a restaurant page on Crumbs.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return (
    <LegalPage>
      <LegalMarkdown md={OWNER_TERMS_MD} />
    </LegalPage>
  )
}

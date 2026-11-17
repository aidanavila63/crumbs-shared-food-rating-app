import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { LegalMarkdown } from '@/components/legal-markdown'
import { PRIVACY_MD } from '@/lib/legal-text'

// Round 78: built once at deploy time from lib/legal-text.ts.
export const metadata: Metadata = {
  title: 'Privacy Policy · Crumbs',
  description: 'What Crumbs collects, why, who sees it, and how to delete it.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return (
    <LegalPage>
      <LegalMarkdown md={PRIVACY_MD} />
    </LegalPage>
  )
}

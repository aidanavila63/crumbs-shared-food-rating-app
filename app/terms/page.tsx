import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { LegalMarkdown } from '@/components/legal-markdown'
import { TERMS_MD } from '@/lib/legal-text'

// Round 78: built once at deploy time from lib/legal-text.ts.
export const metadata: Metadata = {
  title: 'Terms of Use · Crumbs',
  description: 'How Crumbs works, what you agree to, and what Crumbs promises.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return (
    <LegalPage>
      <LegalMarkdown md={TERMS_MD} />
    </LegalPage>
  )
}

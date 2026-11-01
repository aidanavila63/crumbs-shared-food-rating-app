import { Toaster } from 'sonner'
import { CrumbsApp } from '@/components/crumbs-app'
import { AskHost } from '@/components/ask-host'

export default function Page() {
  return (
    <>
      <CrumbsApp />
      <AskHost />
      <Toaster position="top-center" richColors />
    </>
  )
}

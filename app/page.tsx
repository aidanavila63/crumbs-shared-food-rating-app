import { Toaster } from 'sonner'
import { CrumbsApp } from '@/components/crumbs-app'

export default function Page() {
  return <><CrumbsApp /><Toaster position="top-center" richColors /></>
}

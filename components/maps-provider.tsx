'use client'
import { APIProvider } from '@vis.gl/react-google-maps'

export function MapsProvider({ apiKey, children }: { apiKey?: string; children: React.ReactNode }) {
  if (!apiKey) return <>{children}</>
  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'marker']}>
      {children}
    </APIProvider>
  )
}

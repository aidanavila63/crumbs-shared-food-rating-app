'use client'
import { useEffect } from 'react'
import { APIProvider } from '@vis.gl/react-google-maps'
import { markGoogleDown } from '@/lib/google-status'

export function MapsProvider({ apiKey, children }: { apiKey?: string; children: React.ReactNode }) {
  useEffect(() => {
    // Google calls this for bad keys, blocked referrers, disabled APIs, and billing problems.
    ;(window as any).gm_authFailure = () => markGoogleDown()
    return () => {
      delete (window as any).gm_authFailure
    }
  }, [])
  if (!apiKey) return <>{children}</>
  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'marker']} onError={() => markGoogleDown()}>
      {children}
    </APIProvider>
  )
}

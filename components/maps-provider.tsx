'use client'
// E27 (Round 86): Google Maps' code (~200 KB, plus the Places library) used to load on every open
// of the app. Now it loads the first time something actually needs Google: the Google map, place
// search, editing a place's map pin, a place whose hours are due a refresh, and so on. Screens ask
// with useWantGoogle(); until then Google's hooks just return null (as they do while loading).
//
// How: the real APIProvider is mounted beside the app (never around it, so turning it on doesn't
// rebuild every screen), and its context is passed down through the same context the
// @vis.gl/react-google-maps hooks read.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { APIProvider, APIProviderContext } from '@vis.gl/react-google-maps'
import { markGoogleDown } from '@/lib/google-status'

const WantGoogle = createContext<() => void>(() => {})

/** Round 91: true once Google's provider is mounted. Google's <Map> throws without it, so the
 *  map waits for this (the first open after E27 crashed the Map tab: "Something crumbled"). */
export function useGoogleProvider() {
  return useContext(APIProviderContext) !== null
}

/** Call from anything that uses Google (map, places); pass false to not ask (yet). */
export function useWantGoogle(need = true) {
  const want = useContext(WantGoogle)
  useEffect(() => {
    if (need) want()
  }, [need, want])
}

function Bridge({ onValue }: { onValue: (value: unknown) => void }) {
  const value = useContext(APIProviderContext)
  useEffect(() => {
    onValue(value)
  }, [value, onValue])
  return null
}

export function MapsProvider({ apiKey, children }: { apiKey?: string; children: React.ReactNode }) {
  const [wanted, setWanted] = useState(false)
  const [context, setContext] = useState<unknown>(null)
  const want = useCallback(() => setWanted(true), [])
  const onValue = useCallback((value: unknown) => setContext(() => value), [])
  useEffect(() => {
    // Google calls this for bad keys, blocked referrers, disabled APIs, and billing problems.
    ;(window as any).gm_authFailure = () => markGoogleDown()
    return () => {
      delete (window as any).gm_authFailure
    }
  }, [])
  const provided = useMemo(() => context as any, [context])
  return (
    <WantGoogle.Provider value={want}>
      <APIProviderContext.Provider value={provided}>{children}</APIProviderContext.Provider>
      {apiKey && wanted && (
        <APIProvider
          apiKey={apiKey}
          libraries={['places', 'marker']}
          onError={() => markGoogleDown()}
        >
          <Bridge onValue={onValue} />
        </APIProvider>
      )}
    </WantGoogle.Provider>
  )
}

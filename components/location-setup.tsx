'use client'
import { useEffect, useState } from 'react'
import {
  LOCATION_SETUP_EVENT,
  autoLocation,
  locate,
  locationDenied,
  onAutoLocation,
  setAutoLocation,
} from '@/lib/location'
import { Overlay } from './overlay'
import { Switch } from './switch'

// "Location setup": one page that walks anyone through the phone settings that stop location
// being annoying (the popup every time, blocked by mistake, imprecise). Opened from Settings,
// the one-time location card, the Guidebook and the "location is off" messages.

/** Mount once at the app's root; shows the page when openLocationSetup() is called. */
export function LocationSetupHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(LOCATION_SETUP_EVENT, show)
    return () => window.removeEventListener(LOCATION_SETUP_EVENT, show)
  }, [])
  return open ? <LocationSetup onClose={() => setOpen(false)} /> : null
}

type Device = 'iphone' | 'android' | 'computer'

function detectDevice(): Device {
  if (typeof navigator === 'undefined') return 'iphone'
  const ua = navigator.userAgent
  // iPads say "Macintosh" but have a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return 'iphone'
  if (/Android/.test(ua)) return 'android'
  return 'computer'
}

function installed() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  )
}

type Permission = 'granted' | 'denied' | 'prompt' | 'unknown'

function usePermission(): Permission {
  const [state, setState] = useState<Permission>('unknown')
  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = () => status && setState(status.state as Permission)
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        status = s
        update()
        s.addEventListener('change', update)
      })
      .catch(() => {})
    return () => status?.removeEventListener('change', update)
  }, [])
  return state
}

const DEVICES: { id: Device; label: string }[] = [
  { id: 'iphone', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'computer', label: 'Computer' },
]

type Step = { title: string; body: React.ReactNode }

const b = (text: string) => <b className="text-foreground">{text}</b>

const STEPS: Record<Device, Step[]> = {
  iphone: [
    {
      title: 'Turn on Location Services',
      body: (
        <>
          iPhone {b('Settings')} → {b('Privacy & Security')} → {b('Location Services')} → turn it{' '}
          {b('on')}.
        </>
      ),
    },
    {
      title: 'Let Safari use it',
      body: (
        <>
          Same screen, scroll down to {b('Safari Websites')} → {b('While Using the App')}. That’s
          the best choice on this screen — there’s no Allow here, and that’s fine. Keep{' '}
          {b('Precise Location')} on so Nearest and Locate me are spot on. (Crumbs on your home
          screen uses Safari’s settings, even though it looks like its own app.)
        </>
      ),
    },
    {
      title: 'Keep location up to date without tapping',
      body: (
        <>
          This is a different screen from step 2. Go back to the first page of iPhone{' '}
          {b('Settings')} → {b('Apps')} → {b('Safari')} → scroll to{' '}
          {b('Settings for Websites')} → {b('Location')} → {b('Allow')}. On iOS 17 or older it’s{' '}
          {b('Settings')} → {b('Safari')} → {b('Location')}. Home-screen apps forget your answer
          when iOS closes them; with {b('Allow')}, Crumbs can quietly update where you are each time
          it opens.
          <span className="mt-1 block">
            Heads up: this lets every website you visit in Safari see your location without asking.
            Rather not? Leave it on {b('Ask')} — Crumbs won’t pop up when it opens; it uses your last
            spot and asks only when you tap Locate me or Nearest.
          </span>
        </>
      ),
    },
    {
      title: 'Switch it on in Crumbs',
      body: (
        <>
          Turn on {b('Update location when Crumbs opens')} at the top of this page, then tap{' '}
          {b('Test my location')}.
        </>
      ),
    },
  ],
  android: [
    {
      title: 'Turn on location',
      body: <>Swipe down from the top of the screen and turn on {b('Location')}.</>,
    },
    {
      title: 'Let Chrome use it',
      body: (
        <>
          Phone {b('Settings')} → {b('Apps')} → {b('Chrome')} → {b('Permissions')} → {b('Location')}{' '}
          → {b('Allow only while using the app')}. Keep {b('Use precise location')} on.
        </>
      ),
    },
    {
      title: 'Allow Crumbs',
      body: (
        <>
          When Crumbs asks, tap {b('Allow')} (or {b('While using this site')}). Said no by mistake?
          In Chrome open Crumbs, tap the icon left of the web address → {b('Permissions')} →{' '}
          {b('Location')} → {b('Allow')}. Or Chrome {b('⋮')} → {b('Settings')} →{' '}
          {b('Site settings')} → {b('Location')} and take Crumbs out of {b('Blocked')}.
        </>
      ),
    },
    {
      title: 'Switch it on in Crumbs',
      body: (
        <>
          Turn on {b('Update location when Crumbs opens')} at the top of this page, then tap{' '}
          {b('Test my location')}. Android remembers your answer, so you should only be asked once.
          (Another browser? Look for {b('Site permissions')} → {b('Location')} in its settings.)
        </>
      ),
    },
  ],
  computer: [
    {
      title: 'Allow Crumbs in the browser',
      body: (
        <>
          Click the icon just left of the web address (a lock or sliders) → {b('Location')} →{' '}
          {b('Allow')}, then reload the page.
        </>
      ),
    },
    {
      title: 'Let the browser use location',
      body: (
        <>
          Mac: {b('System Settings')} → {b('Privacy & Security')} → {b('Location Services')} → turn
          on your browser. Windows: {b('Settings')} → {b('Privacy & security')} → {b('Location')} →
          turn on {b('Location services')} and {b('Let desktop apps access your location')}.
        </>
      ),
    },
    {
      title: 'Switch it on in Crumbs',
      body: (
        <>
          Turn on {b('Update location when Crumbs opens')} at the top of this page, then tap{' '}
          {b('Test my location')}. Computers guess location from Wi-Fi, so it can be a street or two
          off.
        </>
      ),
    },
  ],
}

const PERMISSION_TEXT: Record<Permission, (device: Device) => [string, string]> = {
  granted: () => ['✅', 'Allowed — no popup needed'],
  denied: () => ['⛔', 'Blocked — follow the steps below'],
  prompt: (device) =>
    device === 'iphone'
      ? ['🟡', 'Asks when you tap Locate me or Nearest — step 3 makes it automatic']
      : ['🟡', 'Not decided yet — tap Test my location'],
  unknown: () => ['❔', 'Can’t tell from here — tap Test my location'],
}

/** The Location setup page itself. */
export function LocationSetup({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useState<Device>(detectDevice)
  const [home] = useState(installed)
  const [on, setOn] = useState(() => autoLocation() === 'on')
  useEffect(() => onAutoLocation(() => setOn(autoLocation() === 'on')), [])
  const permission = usePermission()
  const [test, setTest] = useState<'idle' | 'busy' | 'ok' | 'blocked' | 'failed'>('idle')
  const [icon, permissionText] = PERMISSION_TEXT[permission](device)

  async function runTest() {
    setTest('busy')
    const fix = await locate({ ask: true, maxAge: 0 })
    setTest(fix ? 'ok' : locationDenied() ? 'blocked' : 'failed')
  }

  return (
    <Overlay label="Location setup" title="Location setup" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          A few phone settings make location just work: nearby places first in search, the map
          starting where you are, without tapping Allow. Takes about a minute.
        </p>

        <section className="surface settings-card">
          <h3 className="settings-heading">Right now</h3>
          <div className="settings-row">
            <span>
              <span className="font-semibold">Update location when Crumbs opens</span>
              <span className="block text-sm text-muted-foreground">
                {on ? 'On for this phone.' : 'Off — Crumbs only uses location when you tap for it.'}
              </span>
            </span>
            <Switch
              label="Update location when Crumbs opens"
              checked={on}
              onChange={async (next) => {
                setOn(next)
                if (!next) return void setAutoLocation(false)
                setTest('busy')
                const fix = await setAutoLocation(true)
                setTest(fix ? 'ok' : locationDenied() ? 'blocked' : 'failed')
              }}
            />
          </div>
          <div className="settings-row">
            <span>
              <span className="font-semibold">Phone permission</span>
              <span className="block text-sm text-muted-foreground">
                {icon} {permissionText}
              </span>
            </span>
          </div>
          <button className="primary" disabled={test === 'busy'} onClick={runTest}>
            {test === 'busy' ? 'Finding you…' : '📍 Test my location'}
          </button>
          {test === 'ok' && (
            <p className="text-sm font-semibold" role="status">
              ✅ Location works. You’re all set.
            </p>
          )}
          {test === 'blocked' && (
            <p className="text-sm font-semibold" role="status">
              ⛔ Your phone blocked it. Follow the steps below, then test again.
            </p>
          )}
          {test === 'failed' && (
            <p className="text-sm font-semibold" role="status">
              Couldn’t get a fix in time. Check step 1 below, or try again near a window.
            </p>
          )}
        </section>

        <section className="surface settings-card">
          <h3 className="settings-heading">Steps for your device</h3>
          <div className="segmented segmented-3" role="radiogroup" aria-label="Device">
            <span
              className="segmented-thumb"
              aria-hidden="true"
              style={{
                transform: `translateX(${DEVICES.findIndex((d) => d.id === device) * 100}%)`,
              }}
            />
            {DEVICES.map((d) => (
              <button
                key={d.id}
                role="radio"
                aria-checked={device === d.id}
                className={device === d.id ? 'segmented-active' : ''}
                onClick={() => setDevice(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {device === 'iphone' && !home && (
            <p className="text-sm text-muted-foreground">
              Tip: add Crumbs to your home screen (Share → {b('Add to Home Screen')}) — it opens
              like an app. The steps are the same (iPad too).
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {STEPS[device].map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="setup-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold">{step.title}</span>
                  <span className="block text-sm text-muted-foreground">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="surface settings-card">
          <h3 className="settings-heading">What Crumbs does with it</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>
              Finds places near you first, centres the map, sorts by Nearest and shows distances.
            </li>
            <li>
              Kept on this phone only, rounded to about 100 m. It’s never shown to your group.
            </li>
            <li>
              The one exception: if you answer a map-pin question while standing at a restaurant,
              that spot is saved as the restaurant’s location (the restaurant’s, not yours).
            </li>
            <li>Turn the switch off any time and Crumbs forgets where you were.</li>
          </ul>
        </section>
      </div>
    </Overlay>
  )
}

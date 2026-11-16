'use client'
// Round 75: locations a whole group shares (a work group's office for lunches, "our neighbourhood").
// Everyone in the group sees them and can filter places by them. The owner and admins add them,
// or every member when "Members can add locations" is on. Your own saved areas (Settings) stay
// private: sharing one here is always a copy you chose to make, with a warning first.
import { useState } from 'react'
import { toast } from 'sonner'
import type { Area, Group, GroupLocation, Place } from '@/hooks/use-crumbs-data'
import { askConfirm } from '@/lib/ask'
import { privatePlaceNear } from '@/lib/areas'
import { mainLocation } from '@/lib/anchor'
import { Switch } from './switch'

export const MAX_GROUP_LOCATIONS = 8
const round = (n: number) => Math.round(n * 1e4) / 1e4

export function GroupLocationsCard({
  group,
  locations,
  myAreas,
  places,
  canManage,
  isGuest,
  userId,
  supabase,
  demo,
  onLocations,
  onGroup,
}: {
  group: Group
  locations: GroupLocation[]
  myAreas: Area[]
  places: Place[]
  /** owner or an admin of this group */
  canManage: boolean
  isGuest: boolean
  userId?: string
  supabase: any
  demo: boolean
  onLocations: (next: GroupLocation[]) => void
  onGroup: (group: Group) => void
}) {
  const membersMayAdd = !!group.settings?.members_add_locations
  const canEdit = canManage || (membersMayAdd && !isGuest)
  const [name, setName] = useState('')
  const [km, setKm] = useState(2)
  const [busy, setBusy] = useState(false)
  const pinned = places.filter((p) => p.latitude !== null && p.longitude !== null)
  const clean = name.trim().slice(0, 30)

  async function add(spot: { lat: number; lng: number }, copiedFrom?: string) {
    if (!clean) return toast('Give it a name first (e.g. Office)')
    if (locations.some((l) => l.name.trim().toLowerCase() === clean.toLowerCase()))
      return toast.error(`${group.name} already has a location called ${clean}`)
    // Never share a private place by accident: say who will see it, and ask.
    const near = copiedFrom ? null : privatePlaceNear(spot, myAreas)
    if (copiedFrom || near) {
      const ok = await askConfirm(`Share this spot with ${group.name}?`, {
        body: `This is ${copiedFrom ? `your private place “${copiedFrom}”` : `right by your private place “${near!.name}”`}. Everyone in ${group.name} will be able to see where it is.`,
        confirm: 'Share it',
      })
      if (!ok) return
    }
    const row = { group_id: group.id, name: clean, lat: round(spot.lat), lng: round(spot.lng), km }
    if (demo) {
      onLocations([...locations, { ...row, id: `demo-${Date.now()}` }])
      setName('')
      return toast.success(`${clean} saved`)
    }
    setBusy(true)
    const { data, error } = await supabase
      .from('group_locations')
      .insert({ ...row, created_by: userId })
      .select('id,group_id,name,lat,lng,km,created_by')
      .single()
    setBusy(false)
    if (error) return toast.error(error.message)
    onLocations([...locations, data as GroupLocation])
    setName('')
    toast.success(`${clean} saved — everyone in ${group.name} can filter by it`)
  }

  async function remove(location: GroupLocation) {
    if (!(await askConfirm(`Remove ${location.name}?`, { body: `It goes for everyone in ${group.name}.`, confirm: 'Remove' })))
      return
    const before = locations
    onLocations(locations.filter((l) => l.id !== location.id))
    if (demo) return
    const { error } = await supabase.from('group_locations').delete().eq('id', location.id)
    if (error) {
      onLocations(before)
      toast.error(error.message)
    }
  }

  function here() {
    if (!clean) return toast('Give it a name first (e.g. Office)')
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false)
        add({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => {
        setBusy(false)
        toast.error('Could not get your location. Allow location and try again.')
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  // Round 77: the main location is where Decide, Tonight, Surprise and Explore measure from.
  const mainId = mainLocation(locations, group.settings?.main_location)?.id ?? null
  async function makeMain(location: GroupLocation) {
    const before = group
    const next = { ...group, settings: { ...(group.settings ?? {}), main_location: location.id } }
    onGroup(next)
    if (demo) return
    const { error } = await supabase.from('groups').update({ settings: next.settings }).eq('id', group.id)
    if (error) {
      onGroup(before)
      return toast.error(error.message)
    }
    toast.success(`${location.name} is ${group.name}’s main spot`)
  }

  async function setMembersMayAdd(on: boolean) {
    const before = group
    const next = { ...group, settings: { ...(group.settings ?? {}), members_add_locations: on } }
    onGroup(next)
    if (demo) return
    const { error } = await supabase.from('groups').update({ settings: next.settings }).eq('id', group.id)
    if (error) {
      onGroup(before)
      toast.error(error.message)
    }
  }

  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Group locations</h3>
      <p className="text-sm text-muted-foreground">
        Spots everyone in {group.name} shares — the office for a lunch group, your neighbourhood,
        the campus. Pick one above your places to see just what’s near it. The main one (⭐) is
        where Decide, Tonight, Surprise and Explore measure “near” from; anyone can swap it for
        themselves there. Everyone in the group can see where these are; your own saved areas in
        Settings stay private.
      </p>
      <div className="flex flex-col gap-2">
        {locations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None yet{canEdit ? ' — add the first one below.' : '. The owner or an admin can add one.'}
          </p>
        )}
        {locations.map((location) => (
          <div key={location.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {location.id === mainId ? '⭐' : '📍'} <strong>{location.name}</strong> · within{' '}
              {Number(location.km)} km
              {location.id === mainId && locations.length > 1 && (
                <span className="text-xs text-muted-foreground"> · main</span>
              )}
            </span>
            <span className="flex shrink-0 gap-3">
              {canManage && location.id !== mainId && (
                <button className="text-xs text-primary underline" onClick={() => makeMain(location)}>
                  Make main
                </button>
              )}
              {canEdit && (
                <button className="text-xs text-primary underline" onClick={() => remove(location)}>
                  Remove
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {canEdit && locations.length < MAX_GROUP_LOCATIONS && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="Name (e.g. Office)"
              aria-label="Location name"
              maxLength={30}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <select
              className="field"
              style={{ width: 96 }}
              aria-label="How far around it"
              value={km}
              onChange={(event) => setKm(Number(event.target.value))}
            >
              {[1, 2, 5, 10, 25].map((size) => (
                <option key={size} value={size}>
                  {size} km
                </option>
              ))}
            </select>
          </div>
          <button className="secondary" disabled={busy || !clean} onClick={here}>
            📍 Save “{clean || 'location'}” as where I am now
          </button>
          {pinned.length > 0 && (
            <select
              className="field"
              aria-label="Or centre it on one of the group’s places"
              disabled={busy || !clean}
              value=""
              onChange={(event) => {
                const place = pinned.find((p) => p.id === event.target.value)
                if (place) add({ lat: place.latitude!, lng: place.longitude! })
              }}
            >
              <option value="">…or centre it on one of our places</option>
              {pinned.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          )}
          {myAreas.length > 0 && (
            <select
              className="field"
              aria-label="Or copy one of your private places"
              disabled={busy || !clean}
              value=""
              onChange={(event) => {
                const area = myAreas.find((a) => a.name === event.target.value)
                if (area) add({ lat: area.lat, lng: area.lng }, area.name)
              }}
            >
              <option value="">…or copy one of my private places (asks first)</option>
              {myAreas.map((area) => (
                <option key={area.name} value={area.name}>
                  {area.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {canManage && (
        <div className="settings-row">
          <span>
            <span className="font-semibold">Members can add locations</span>
            <span className="block text-sm text-muted-foreground">
              Off: only the owner and admins. Guests never can.
            </span>
          </span>
          <Switch label="Members can add locations" checked={membersMayAdd} onChange={setMembersMayAdd} />
        </div>
      )}
    </section>
  )
}

// Round 80 (solo-first): My Crumbs is a group of one — your private space. It sits first in the
// list of your spaces; your groups follow in the order they came.
import type { Group } from '@/hooks/use-crumbs-data'

export const isPersonal = (group?: Pick<Group, 'is_personal'> | null) => !!group?.is_personal

/** Your private space first, then your groups (otherwise in the order given). */
export function orderSpaces<T extends Pick<Group, 'is_personal'>>(groups: T[]): T[] {
  return [...groups.filter((g) => isPersonal(g)), ...groups.filter((g) => !isPersonal(g))]
}

/** Spaces you could also save a place to: every other one you're in, minus ones that have it. */
export function saveTargets<T extends Pick<Group, 'id' | 'is_personal'>>(
  groups: T[],
  currentId: string,
  alreadyIn: Iterable<string>,
): T[] {
  const have = new Set(alreadyIn)
  return orderSpaces(groups.filter((g) => g.id !== currentId && !have.has(g.id)))
}

/** The line under the space's name at the top of the app. */
export const spaceKicker = (group?: Pick<Group, 'is_personal'> | null) =>
  isPersonal(group) ? 'Just for you · nobody else can see it' : 'Your shared food map'

// Third pass #1 (Round 77): who takes over when the owner leaves — admins first, then everyone
// else, never guests (the database picks the same way: group_heir in 20261116_round77.sql).
type Member = { id: string; role?: string | null }

export function heirs<T extends Member>(members: T[], ownerId: string): T[] {
  return members
    .filter((m) => m.id !== ownerId && m.role !== 'guest')
    .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin'))
}

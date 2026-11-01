import { describe, expect, it } from 'vitest'
import { buildWinsIndex } from '../components/RoleName'
import type { MemberStats } from './stats'

const member = (id: string, name: string, allWins: number): MemberStats => ({ publicId: id, name, allWins, cynGames: [{ username: name }] }) as unknown as MemberStats

describe('buildWinsIndex', () => {
  const all = [member('AAAA1111', 'Zilka', 520), member('BBBB2222', 'Portatto', 800), member('CCCC3333', 'Calos', 300)]

  it('counts everybody while the clan list is not known', () => {
    const idx = buildWinsIndex(all, null)
    expect(idx.byId.get('BBBB2222')).toBe(800)
    expect(idx.byName.get('portatto')).toBe(800)
  })

  it('leaves out members who are not in the clan any more (no colours, no frame)', () => {
    const idx = buildWinsIndex(all, new Set(['AAAA1111', 'CCCC3333']))
    expect(idx.byId.get('AAAA1111')).toBe(520)
    expect(idx.byId.has('BBBB2222')).toBe(false)
    expect(idx.byName.has('portatto')).toBe(false)
  })

  it('still knows the registered name of a member who left', () => {
    const idx = buildWinsIndex(all, new Set(['AAAA1111']))
    expect(idx.nameById.get('BBBB2222')).toBe('Portatto')
  })
})

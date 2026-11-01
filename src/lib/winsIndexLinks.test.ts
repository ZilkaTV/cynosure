import { describe, expect, it } from 'vitest'
import { buildWinsIndex } from '../components/RoleName'
import type { MemberStats } from './stats'

const member = (publicId: string, name: string, played: string[] = []) =>
  ({ publicId, name, allWins: 10, cynGames: played.map((username) => ({ username })) }) as unknown as MemberStats

describe('buildWinsIndex idByName (where a name in a report or a game list links to)', () => {
  it('finds a member by the registered name, ignoring case', () => {
    const idx = buildWinsIndex([member('AAAA1111', 'Calos'), member('BBBB2222', 'Chuma')], null)
    expect(idx.idByName.get('calos')).toBe('AAAA1111')
    expect(idx.idByName.get('chuma')).toBe('BBBB2222')
  })

  it('finds a member by a name played in a game when only that member played under it', () => {
    const idx = buildWinsIndex([member('AAAA1111', 'cal0s_', ['Calos']), member('BBBB2222', 'Chuma')], null)
    expect(idx.idByName.get('calos')).toBe('AAAA1111')
  })

  it('does not link a name that two members played under', () => {
    const idx = buildWinsIndex([member('AAAA1111', 'One', ['Shared']), member('BBBB2222', 'Two', ['Shared'])], null)
    expect(idx.idByName.has('shared')).toBe(false)
  })

  it('also links members who left the clan (their profile still exists), while the wins colours skip them', () => {
    const idx = buildWinsIndex([member('AAAA1111', 'Stayer'), member('BBBB2222', 'Leaver')], new Set(['AAAA1111']))
    expect(idx.idByName.get('leaver')).toBe('BBBB2222')
    expect(idx.byName.has('leaver')).toBe(false)
  })
})

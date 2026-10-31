import { describe, it, expect } from 'vitest'
import { parseDonorExport } from './clanDonors'

const row = (playerId: string, total: string, donations = 1, username: string | null = 'x') => ({ playerId, username, total, donations })
const boards = () => {
  const b: Record<string, Record<string, unknown[]>> = { soft: {}, hard: {} }
  for (const c of ['soft', 'hard']) for (const p of ['all', 'month', 'week']) b[c][p] = [row('AAAA1111', '500'), row('BBBB2222', '70')]
  return b
}

describe('parseDonorExport', () => {
  it('reads what the userscript sends, as an object or as text', () => {
    const parsed = parseDonorExport({ boards: boards() })
    expect(parsed?.soft.all.map((d) => d.playerId)).toEqual(['AAAA1111', 'BBBB2222'])
    expect(parsed?.hard.week[1].rank).toBe(2)
    expect(parseDonorExport(JSON.stringify({ boards: boards() }))?.soft.month).toHaveLength(2)
  })

  it('takes amounts too big for a Number as text', () => {
    const b = boards()
    b.soft.all = [row('AAAA1111', '123456789012345678')]
    expect(parseDonorExport({ boards: b })?.soft.all[0].total).toBe('123456789012345678')
  })

  it('refuses text that is not the export', () => {
    expect(parseDonorExport('hello')).toBeNull()
    expect(parseDonorExport({ boards: { soft: {} } })).toBeNull()
    expect(parseDonorExport(null)).toBeNull()
  })

  it('refuses a row with a bad amount or without an id', () => {
    const bad = boards()
    bad.soft.all = [row('AAAA1111', '12abc')]
    expect(parseDonorExport({ boards: bad })).toBeNull()
    const noId = boards()
    noId.hard.all = [{ username: 'x', total: '5', donations: 1 }]
    expect(parseDonorExport({ boards: noId })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { cleanDisplayName, initialOf } from './displayName'

describe('cleanDisplayName', () => {
  it('collapses long runs of the same character to one', () => {
    expect(cleanDisplayName('Franquitooooooooooooooooo')).toBe('Franquito')
    expect(cleanDisplayName('HelloOOOoooo')).toBe('Hello')
  })

  it('leaves normal names with double or triple letters alone', () => {
    for (const n of ['Missouri', 'ashfalllive', 'Zilka', 'alt_number3', '.Tim21', 'Anna']) expect(cleanDisplayName(n)).toBe(n)
  })
})

describe('initialOf', () => {
  it('uses the first letter and ignores a clan tag in front', () => {
    expect(initialOf('CYN Bane')).toBe('B')
    expect(initialOf('[CYN] Bane')).toBe('B')
    expect(initialOf('cyn_zilka')).toBe('Z')
    expect(initialOf('soothxng')).toBe('S')
    expect(initialOf('Bane')).toBe('B')
  })
  it('keeps names that only start with the same letters as the tag', () => {
    expect(initialOf('Cynthia')).toBe('C')
    expect(initialOf('Cyn')).toBe('C')
  })
  it('skips symbols and never returns an empty string', () => {
    expect(initialOf('~~Kron')).toBe('K')
    expect(initialOf('---')).toBe('?')
  })
})

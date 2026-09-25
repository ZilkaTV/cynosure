import { describe, expect, it } from 'vitest'
import { cleanDisplayName } from './displayName'

describe('cleanDisplayName', () => {
  it('collapses long runs of the same character to one', () => {
    expect(cleanDisplayName('Franquitooooooooooooooooo')).toBe('Franquito')
    expect(cleanDisplayName('HelloOOOoooo')).toBe('Hello')
  })

  it('leaves normal names with double or triple letters alone', () => {
    for (const n of ['Missouri', 'ashfalllive', 'Zilka', 'alt_number3', '.Tim21', 'Anna']) expect(cleanDisplayName(n)).toBe(n)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCosmetics } from '../../worker/cosmetics.js'

// OpenFront's cosmetics file, cut down: two items of the CYN store, the two clan event prizes, one item of somebody else and the hidden cyn_2
const SOURCE = {
  colorPalettes: {},
  patterns: {
    cyn_crest: { name: 'cyn_crest', affiliateCode: 'cyn', priceHard: 200, rarity: 'common', pattern: 'AAAA' },
    cyn_2: { name: 'cyn_2', affiliateCode: 'cyn', priceHard: 255, pattern: 'BBBB' },
    cyn_trio_event_winner: { name: 'cyn_trio_event_winner', rarity: 'legendary', artist: 'eiwalis', pattern: 'CCCC' },
    ofml_cyn_cw_pattern: { name: 'ofml_cyn_cw_pattern', rarity: 'common', pattern: 'DDDD' },
    other_skin: { name: 'other_skin', affiliateCode: 'xyz', priceHard: 100, pattern: 'EEEE' },
  },
  flags: {},
  crowns: {},
}

async function ask(scope?: string) {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(SOURCE), { status: 200 }))
  const res = await handleCosmetics(new Request(`https://cynclan.com/api/cosmetics${scope ? `?scope=${scope}` : ''}`), undefined)
  return (await res.json()) as { patterns: { id: string; event: boolean; price: number | null }[] }
}

afterEach(() => vi.unstubAllGlobals())

describe('/api/cosmetics for the Skin Shop', () => {
  it('lists the store items of the clan and the two event prizes, marked as event prizes', async () => {
    const { patterns } = await ask()
    expect(patterns.map((p) => p.id).sort()).toEqual(['cyn_crest', 'cyn_trio_event_winner', 'ofml_cyn_cw_pattern'])
    expect(patterns.find((p) => p.id === 'cyn_trio_event_winner')).toMatchObject({ event: true, price: null })
    expect(patterns.find((p) => p.id === 'ofml_cyn_cw_pattern')?.event).toBe(true)
    expect(patterns.find((p) => p.id === 'cyn_crest')?.event).toBe(false)
  })
  it('keeps the hidden item out and does not add the items of other creators', async () => {
    const ids = (await ask()).patterns.map((p) => p.id)
    expect(ids).not.toContain('cyn_2')
    expect(ids).not.toContain('other_skin')
  })
  it('scope=all still gives everything except the hidden item', async () => {
    const ids = (await ask('all')).patterns.map((p) => p.id)
    expect(ids).toContain('other_skin')
    expect(ids).not.toContain('cyn_2')
  })
})

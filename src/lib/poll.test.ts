import { describe, expect, it } from 'vitest'
import { cleanForSubmit, tally } from './poll'

describe('poll', () => {
  it('cleanForSubmit keeps known choices, ratings and trimmed texts and drops the rest', () => {
    const out = cleanForSubmit({ freq: 'daily', change: 'nope', why_less: ['time', 'bogus', 'meta'], site: 4, missing: '  more events  ', free: '   ' })
    expect(out).toEqual({ freq: 'daily', why_less: ['meta', 'time'], site: 4, missing: 'more events' })
  })

  it('cleanForSubmit cuts a rating outside 1-5 and long texts', () => {
    const out = cleanForSubmit({ site: 9, missing: 'x'.repeat(900) })
    expect(out.site).toBeUndefined()
    expect((out.missing as string).length).toBe(500)
  })

  it('tally counts options, averages ratings and lists texts', () => {
    const t = tally([
      { freq: 'daily', modes: ['ffa', 'r1v1'], site: 5, free: 'gut' },
      { freq: 'daily', modes: ['ffa'], site: 3 },
      { freq: 'rare', site: 4, free: 'mehr events' },
    ])
    const freq = t.find((x) => x.id === 'freq')
    expect(freq?.kind === 'single' && freq.options.find((o) => o.id === 'daily')?.count).toBe(2)
    const modes = t.find((x) => x.id === 'modes')
    expect(modes?.kind === 'multi' && modes.options.find((o) => o.id === 'ffa')?.count).toBe(2)
    const site = t.find((x) => x.id === 'site')
    expect(site?.kind === 'scale' && site.average).toBeCloseTo(4)
    const free = t.find((x) => x.id === 'free')
    expect(free?.kind === 'text' && free.texts).toEqual(['gut', 'mehr events'])
  })

  it('tally of no answers is empty, not NaN', () => {
    const site = tally([]).find((x) => x.id === 'site')
    expect(site?.kind === 'scale' && site.average).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { tallyQuestion, type SurveyResponseSummary } from './survey'

function resp(names: string[]): SurveyResponseSummary {
  return { inGameName: 'x', discordUsername: null, answers: { q: names }, comment: null, createdAt: '' }
}

describe('tallyQuestion', () => {
  it('drops non-answers', () => {
    const t = tallyQuestion([resp(['idk', 'None', 'Dunno']), resp(['-', 'Zilka', 'blank'])], 'q')
    expect(t).toEqual([{ name: 'Zilka', count: 1 }])
  })

  it('merges spelling variants voted by different people', () => {
    const t = tallyQuestion([resp(['Zixer1']), resp(['Zixer2']), resp(['Ultimus_rex']), resp(['Rex'])], 'q')
    expect(t).toEqual([
      { name: 'UltimusRex', count: 2 },
      { name: 'Zixer', count: 2 },
    ])
  })

  it('counts one voter naming several variants of the same person only once', () => {
    const t = tallyQuestion([resp(['cosmic', 'cosmicvoid', 'Nikas']), resp(['CosmicVoidArchon'])], 'q')
    expect(t).toEqual([
      { name: 'cosmicvoidarchon', count: 2 },
      { name: 'Nikas', count: 1 },
    ])
  })
})

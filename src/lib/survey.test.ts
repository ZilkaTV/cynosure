import { describe, expect, it } from 'vitest'
import { ALL_SURVEY_QUESTIONS, tallyQuestion, validateAnswers, type SurveyAnswers, type SurveyResponseSummary } from './survey'

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

function ballot(override: Record<string, string[]> = {}): SurveyAnswers {
  const a: SurveyAnswers = {}
  for (const q of ALL_SURVEY_QUESTIONS) a[q.id] = ['Alpha', 'Bravo', 'Charlie']
  return { ...a, ...override }
}

describe('validateAnswers', () => {
  it('accepts a normal ballot', () => {
    expect(validateAnswers(ballot())).toBeNull()
  })

  it('rejects non-answers', () => {
    expect(validateAnswers(ballot({ players_ffa: ['Alpha', 'idk', 'Charlie'] }))).toMatch(/isn't a real nominee/)
    expect(validateAnswers(ballot({ players_ffa: ['Alpha', 'none', 'Charlie'] }))).toMatch(/isn't a real nominee/)
  })

  it('rejects two spellings of the same nominee in one question', () => {
    expect(validateAnswers(ballot({ players_ffa: ['Zixer', 'Zixer2', 'Charlie'] }))).toMatch(/same nominee/)
    expect(validateAnswers(ballot({ players_ffa: ['Rex', 'Ultimus_rex', 'Charlie'] }))).toMatch(/same nominee/)
  })

  it('still allows the same name in different questions', () => {
    expect(validateAnswers(ballot({ players_ffa: ['Zixer', 'Bravo', 'Charlie'], players_team: ['Zixer2', 'Bravo', 'Charlie'] }))).toBeNull()
  })
})

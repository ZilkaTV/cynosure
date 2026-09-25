import { describe, expect, it } from 'vitest'
import { ALL_SURVEY_QUESTIONS, tallyQuestion, validateAnswers, findAnswerProblem, isSurveyClosed, REVEAL_AT, type SurveyAnswers, type SurveyResponseSummary } from './survey'

const tally = (r: SurveyResponseSummary[], q: string) => tallyQuestion(r, q).map(({ name, count }) => ({ name, count }))

function resp(names: string[]): SurveyResponseSummary {
  return { inGameName: 'x', discordUsername: null, answers: { q: names }, comment: null, createdAt: '' }
}

describe('tallyQuestion', () => {
  it('drops non-answers', () => {
    const t = tally([resp(['idk', 'None', 'Dunno']), resp(['-', 'Zilka', 'blank'])], 'q')
    expect(t).toEqual([{ name: 'Zilka', count: 1 }])
  })

  it('drops numbered non-answers and merges numbered / typo variants', () => {
    const t = tally([resp(['idk2', 'idk3', 'cosmicvoid2']), resp(['cosmicvoidarchn']), resp(['CosmicVoidArchon'])], 'q')
    expect(t).toEqual([{ name: 'cosmicvoidarchon', count: 3 }])
  })

  it('treats alt and Alt_Number3 as the same nominee', () => {
    const t = tally([resp(['alt']), resp(['Alt_Number3']), resp(['alt_3'])], 'q')
    expect(t).toEqual([{ name: 'alt_number_3', count: 3 }])
  })

  it('merges spelling variants voted by different people', () => {
    const t = tally([resp(['Zixer1']), resp(['Zixer2']), resp(['Ultimus_rex']), resp(['Rex'])], 'q')
    expect(t).toEqual([
      { name: 'UltimusRex', count: 2 },
      { name: 'Zixer', count: 2 },
    ])
  })

  it('counts one voter naming several variants of the same person only once', () => {
    const t = tally([resp(['cosmic', 'cosmicvoid', 'Nikas']), resp(['CosmicVoidArchon'])], 'q')
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

describe('findAnswerProblem', () => {
  it('points at the exact empty slot', () => {
    expect(findAnswerProblem(ballot({ players_ffa: ['Alpha', '', 'Charlie'] }))).toMatchObject({ questionId: 'players_ffa', slots: [1] })
  })

  it('points at both slots of a same-person pair', () => {
    expect(findAnswerProblem(ballot({ players_ffa: ['Zixer', 'Bravo', 'Zixer2'] }))).toMatchObject({ questionId: 'players_ffa', slots: [0, 2] })
  })
})

describe('junk and new aliases', () => {
  it('drops very short, repeated-character and filler answers', () => {
    const t = tally([resp(['a', 'aa', 's', 'ss', 'me', 'Community']), resp(['aaaa', '1234', 'Zilka'])], 'q')
    expect(t).toEqual([{ name: 'Zilka', count: 1 }])
  })

  it('merges jaded/jadedrose and ash/ashfall/ashfalllive', () => {
    const t = tally([resp(['jaded']), resp(['JadedRose']), resp(['ash']), resp(['ashfall']), resp(['ashfalllive'])], 'q')
    expect(t).toEqual([
      { name: 'ashfalllive', count: 3 },
      { name: 'jadedrose', count: 2 },
    ])
  })
})

describe('clan questions', () => {
  it('keeps ash as a real clan tag and drops the player ashfalllive', () => {
    const responses: SurveyResponseSummary[] = [
      { inGameName: 'x', discordUsername: null, answers: { clans_ffa: ['ASH', 'ashfalllive', 'ashfall'] }, comment: null, createdAt: '' },
      { inGameName: 'y', discordUsername: null, answers: { clans_ffa: ['ash', 'CYN'] }, comment: null, createdAt: '' },
    ]
    expect(tally(responses, 'clans_ffa')).toEqual([
      { name: 'ASH', count: 2 },
      { name: 'CYN', count: 1 },
    ])
  })
})

describe('more aliases', () => {
  it('merges the new groups, counting a voter who names two variants once', () => {
    const t = tally(
      [
        resp(['Morta', 'Mortality', 'Nvr']),
        resp(['Mortality']),
        resp(['Nvr_kn']),
        resp(['pyrrha']),
        resp(['pyrrah']),
        resp(['soothing']),
        resp(['soothxng']),
        resp(['evimito']),
        resp(['evil_Mitochondria']),
      ],
      'q',
    )
    expect(t.map((e) => [e.name, e.count])).toEqual([
      ['evil_Mitochondria', 2],
      ['Mortality', 2],
      ['Nvr_Kn', 2],
      ['pyrrah', 2],
      ['soothxng', 2],
    ])
  })
})

describe('automatic look-alike merging', () => {
  it('merges typos, numbered and start/end variants nobody listed by hand', () => {
    const t = tallyQuestion(
      [resp(['Wolfgang']), resp(['wolfgan']), resp(['Wolfgang2']), resp(['Tiberius']), resp(['tiber']), resp(['Blackbird']), resp(['Blackbird']), resp(['xblackbird'])],
      'q',
    )
    expect(t.map((e) => [e.name, e.count])).toEqual([
      ['Blackbird', 3],
      ['Wolfgang', 3],
      ['Tiberius', 2],
    ])
    expect(t.find((e) => e.name === 'Wolfgang')?.variants.sort()).toEqual(['Wolfgang2', 'wolfgan'])
  })

  it('counts one voter once even if their two spellings are only automatically linked', () => {
    const t = tallyQuestion([resp(['Wolfgang', 'wolfgan', 'Alice']), resp(['Wolfgang'])], 'q')
    expect(t.find((e) => e.name === 'Wolfgang')?.count).toBe(2)
  })

  it('does not merge short names or clearly different players', () => {
    const t = tally([resp(['alex']), resp(['alexander']), resp(['Marcus']), resp(['Marius'])], 'q')
    expect(t.map((e) => e.name).sort()).toEqual(['Marcus', 'Marius', 'alex', 'alexander'])
  })

  it('leaves clan tags alone', () => {
    const responses: SurveyResponseSummary[] = [
      { inGameName: 'x', discordUsername: null, answers: { clans_team: ['ASTRO', 'ASTROX'] }, comment: null, createdAt: '' },
    ]
    expect(tally(responses, 'clans_team').map((e) => e.name).sort()).toEqual(['ASTRO', 'ASTROX'])
  })

  it('blocks look-alike names within one player question at submit', () => {
    expect(findAnswerProblem(ballot({ players_ffa: ['Wolfgang', 'Bravo', 'wolfgan'] }))).toMatchObject({ questionId: 'players_ffa', slots: [0, 2] })
  })
})

describe('short clan tags', () => {
  it('allows two-letter clan tags like UN in clan questions but not in player questions', () => {
    const answers = (id: string): SurveyResponseSummary[] => [
      { inGameName: 'x', discordUsername: null, answers: { [id]: ['UN', 'a'] }, comment: null, createdAt: '' },
    ]
    expect(tally(answers('clans_ffa'), 'clans_ffa')).toEqual([{ name: 'UN', count: 1 }])
    expect(tally(answers('players_ffa'), 'players_ffa')).toEqual([])
  })

  it('accepts UN as a clan answer at submit', () => {
    expect(validateAnswers(ballot({ clans_team: ['UN', 'CYN', 'ASH'] }))).toBeNull()
  })
})

describe('short player names', () => {
  it('accepts RY as a player', () => {
    expect(tally([resp(['RY']), resp(['ry']), resp(['ab'])], 'q')).toEqual([{ name: 'RY', count: 2 }])
    expect(validateAnswers(ballot({ players_ffa: ['RY', 'Bravo', 'Charlie'] }))).toBeNull()
  })
})

describe('closing', () => {
  it('is open before the reveal and closed from that moment on', () => {
    expect(isSurveyClosed(REVEAL_AT - 1)).toBe(false)
    expect(isSurveyClosed(REVEAL_AT)).toBe(true)
    expect(new Date(REVEAL_AT).toISOString()).toBe('2026-09-26T18:00:00.000Z')
  })
})

describe('John alias', () => {
  it('shows jhon as John', () => {
    expect(tally([resp(['jhon']), resp(['John'])], 'q')).toEqual([{ name: 'John', count: 2 }])
  })
})

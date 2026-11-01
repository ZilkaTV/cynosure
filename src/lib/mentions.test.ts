import { describe, expect, it } from 'vitest'
import { mentionStatements, mentionedIds, nameVariants, splitMentions } from '../../worker/mentions.js'

const members = [
  { openfront_id: 'AAAA1111', in_game_name: 'Calos' },
  { openfront_id: 'BBBB2222', in_game_name: '[CYN] Bane' },
  { openfront_id: 'CCCC3333', in_game_name: 'Bob' },
  { openfront_id: 'DDDD4444', in_game_name: 'Bob Smith' },
  { openfront_id: 'EEEE5555', in_game_name: 'Zilka' },
]

describe('nameVariants', () => {
  it('knows a name with and without the clan tag', () => {
    expect(nameVariants('[CYN] Bane')).toEqual(['[CYN] Bane', 'Bane'])
    expect(nameVariants('CYN Bane')).toEqual(['CYN Bane', 'Bane'])
    expect(nameVariants('Calos')).toEqual(['Calos'])
  })
})

describe('mentionedIds', () => {
  it('finds a member by @name, ignoring case', () => {
    expect(mentionedIds('gg @calos, nice one', members, 'EEEE5555')).toEqual(['AAAA1111'])
  })
  it('finds a member written without the clan tag', () => {
    expect(mentionedIds('@Bane look at this', members, 'EEEE5555')).toEqual(['BBBB2222'])
  })
  it('prefers the longest name ("@Bob Smith" is Bob Smith, not Bob)', () => {
    expect(mentionedIds('@Bob Smith and @Bob', members, 'EEEE5555')).toEqual(['DDDD4444', 'CCCC3333'])
  })
  it('does not continue into a longer word, and ignores e-mail addresses', () => {
    expect(mentionedIds('@Calosx hi', members, 'EEEE5555')).toEqual([])
    expect(mentionedIds('write to mail@Calos.com', members, 'EEEE5555')).toEqual([])
  })
  it('never notifies the author and notifies everybody once', () => {
    expect(mentionedIds('@Zilka @Calos @calos', members, 'EEEE5555')).toEqual(['AAAA1111'])
  })
  it('notifies at most five members', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ openfront_id: `ID${i}`, in_game_name: `Player${i}` }))
    expect(mentionedIds(many.map((m) => `@${m.in_game_name}`).join(' '), many, 'X')).toHaveLength(5)
  })
})

describe('splitMentions', () => {
  it('cuts the text into plain pieces and mentions', () => {
    expect(splitMentions('hi @Calos!', members)).toEqual([{ text: 'hi ' }, { text: '@Calos', id: 'AAAA1111' }, { text: '!' }])
  })
  it('keeps a text without a mention whole', () => {
    expect(splitMentions('nothing here', members)).toEqual([{ text: 'nothing here' }])
  })
})

/** A tiny stand-in for the D1 binding: records what is asked. */
function fakeDb(tableExists = true) {
  const calls: { sql: string; args: unknown[] }[] = []
  return {
    calls,
    prepare(sql: string) {
      return {
        all: async () => ({ results: members }),
        first: async () => (tableExists ? { x: 1 } : null),
        bind: (...args: unknown[]) => {
          calls.push({ sql, args })
          return { sql, args }
        },
      }
    },
  }
}

describe('mentionStatements', () => {
  it('gives no statement for a comment without a mention', async () => {
    const db = fakeDb()
    expect(await mentionStatements(db, { table: 'cyn_game_comments', kind: 'game', ref: 'g1', authorId: 'EEEE5555', body: 'plain text' })).toEqual([])
  })
  it('records the mentioned members of a game comment', async () => {
    const db = fakeDb()
    const out = await mentionStatements(db, { table: 'cyn_game_comments', kind: 'game', ref: 'g1', authorId: 'EEEE5555', body: 'gg @Calos @Bane' })
    expect(out).toHaveLength(1)
    expect(db.calls[0].sql).toContain('INSERT INTO cyn_mentions')
    expect(db.calls[0].sql).toContain('FROM cyn_game_comments')
    expect(db.calls[0].args).toEqual(['EEEE5555', 'game', 'EEEE5555', 'g1', JSON.stringify(['AAAA1111', 'BBBB2222'])])
  })
  it('saves the comment without notifying when the table does not exist yet', async () => {
    const db = fakeDb(false)
    expect(await mentionStatements(db, { table: 'cyn_profile_comments', kind: 'profile', ref: 'P1', authorId: 'EEEE5555', body: '@Calos' })).toEqual([])
  })
})

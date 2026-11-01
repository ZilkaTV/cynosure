import { describe, expect, it } from 'vitest'
import { parseTwitch, parseYoutube, twitchUrl, youtubeUrl } from './profileExtras'

describe('parseYoutube', () => {
  it('takes handles and links', () => {
    expect(parseYoutube('@Zilka')).toBe('@Zilka')
    expect(parseYoutube('Zilka')).toBe('@Zilka')
    expect(parseYoutube('https://www.youtube.com/@Zilka/videos')).toBe('@Zilka')
    expect(parseYoutube('youtube.com/channel/UCabcdefghijklmnopqrstuv')).toBe('UCabcdefghijklmnopqrstuv')
    expect(parseYoutube('UCabcdefghijklmnopqrstuv')).toBe('UCabcdefghijklmnopqrstuv')
  })
  it('refuses everything else', () => {
    for (const bad of ['', 'javascript:alert(1)', 'a b', 'ab', '<script>', 'https://evil.com/@name']) expect(parseYoutube(bad)).toBeNull()
  })
  it('builds the channel link', () => {
    expect(youtubeUrl('@Zilka')).toBe('https://www.youtube.com/@Zilka')
    expect(youtubeUrl('UCabcdefghijklmnopqrstuv')).toBe('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')
  })
})

describe('parseTwitch', () => {
  it('takes names and links', () => {
    expect(parseTwitch('zilka_tv')).toBe('zilka_tv')
    expect(parseTwitch('https://www.twitch.tv/zilka_tv')).toBe('zilka_tv')
    expect(parseTwitch('twitch.tv/zilka_tv?sr=a')).toBe('zilka_tv')
  })
  it('refuses everything else', () => {
    for (const bad of ['', 'ab', 'a b c d', 'javascript:alert(1)', 'x'.repeat(26)]) expect(parseTwitch(bad)).toBeNull()
  })
  it('builds the channel link', () => {
    expect(twitchUrl('zilka_tv')).toBe('https://www.twitch.tv/zilka_tv')
  })
})

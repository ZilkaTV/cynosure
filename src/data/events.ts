// ── Events ───────────────────────────────────────────────────────────────────
// Static event metadata (name, dates, rules, reward). Team standings and
// submissions live in Supabase (src/lib/events.ts) so they update live as
// admins accept submissions - only edit this file for new events or rule
// changes.

export interface ClanEvent {
  id: string
  name: string
  status: 'live' | 'upcoming' | 'ended'
  start: string // ISO date
  end: string // ISO date
  description: string
  reward: string
  /** Optional external image URL for the reward skin preview (any hosted link works). */
  skinImageUrl?: string
}

export const EVENTS: ClanEvent[] = [
  {
    id: 'trio-challenge-2026',
    name: 'CYN Trio Challenge',
    status: 'live',
    start: '2026-06-07',
    end: '2026-09-07',
    description:
      'Play Trio games with your official team. You can play public Trio games (teams of 3) or scrims against other teams (2, 4, 6, 8... teams, 3 players per team). You can set up your own scrims if you find 1 or more other teams.',
    reward:
      'Winning team gets a unique in-game pattern and becomes the CYN main team at the end of the event.',
    // NOTE: this is a Discord CDN attachment link, which is signed and expires
    // (~24h after upload) - it WILL stop working. Replace it with a permanent
    // host (e.g. imgur) or drop the file at public/events/trio-challenge-2026.png
    // and remove this URL so the local-file fallback in Events.tsx takes over.
    skinImageUrl:
      'https://media.discordapp.net/attachments/1508138804064555138/1508516254141644971/57VwBUAAAAGSURBVAMAh3vPefvzYEQAAAAASUVORK5CYII.png?ex=6a566c3d&is=6a551abd&hm=79d413e33a9fdfb9b1f64b5c13af88e6450eda81424949fdd16d4048fb521bc4&=&format=webp&quality=lossless',
  },
]

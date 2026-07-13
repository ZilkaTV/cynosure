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
  },
]

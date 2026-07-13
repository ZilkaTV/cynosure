// ── Events ───────────────────────────────────────────────────────────────────
// Event details + team leaderboard are admin-tracked (screenshots posted in
// Discord get manually confirmed and scored), so this is a plain data file you
// edit by hand and push - there's no automatic scoring for this one.

export interface EventLeaderboardRow {
  team: string
  points: number
}

export interface ClanEvent {
  id: string
  name: string
  status: 'live' | 'upcoming' | 'ended'
  start: string // ISO date
  end: string // ISO date
  description: string
  rules: string[]
  submitChannel: string // where to post proof
  reward: string
  leaderboard: EventLeaderboardRow[]
  leaderboardUpdated: string // e.g. "2 Jul 2026"
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
    rules: [
      '1 point for a public Trio game win',
      '2 points for a 3v3 scrim win',
      '5 points for a scrim win with more than 4 teams',
      '10 points for a tournament win',
    ],
    submitChannel: '#event-wins',
    reward:
      'Winning team gets a unique in-game pattern and becomes the CYN main team at the end of the event.',
    leaderboardUpdated: '2 Jul 2026',
    leaderboard: [
      { team: 'Team CYN', points: 59 },
      { team: 'Team GAS', points: 11 },
      { team: 'Team GER', points: 8 },
      { team: 'Team BUM', points: 2 },
      { team: 'Team', points: 0 },
      { team: 'Team', points: 0 },
      { team: 'Team', points: 0 },
    ],
  },
]

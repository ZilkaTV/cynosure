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
  /** Set once status is 'ended' - the winning team's name, exactly as registered in cyn_event_teams. */
  winner?: string
  /** 'raffle' = no teams and no submissions: an info card (goal, how to take part, points, prize, skin pictures) built in Events.tsx. */
  kind?: 'raffle'
  /** Local clock time of the last day, shown behind the end date. */
  endTime?: string
  /** Pictures of the reward (raffle events). */
  skinImages?: { url: string; label: string }[]
  /** Clan leaderboard rank the clan has to reach (raffle events). */
  goalRank?: number
  /** Exact window of the raffle in UTC (German time is UTC+1 in winter) - what counts for the Factor Wheel. */
  windowFrom?: string
  windowTo?: string
}

const EVENT_LIST: ClanEvent[] = [
  {
    id: 'cyn-hero-skin-2026',
    name: 'CYN Hero Skin Event',
    kind: 'raffle',
    status: 'upcoming',
    start: '2026-11-01',
    end: '2026-12-31',
    endTime: '23:59',
    goalRank: 7,
    windowFrom: '2026-10-31T23:00:00Z', // 1 Nov 00:00 German time
    windowTo: '2026-12-31T22:59:59Z', // 31 Dec 23:59:59 German time
    description: 'Reach rank 7 on the clan leaderboard. Everybody who plays team games with another CYN member can win an exclusive skin that exists only 3 times in the world, plus Plutonium.',
    reward: 'An exclusive skin that exists only 3 times in the world, plus Plutonium.',
    skinImages: [
      { url: '/events/cyn-hero-ffa.webp', label: 'FFA mode' },
      { url: '/events/cyn-hero-team.webp', label: 'Team mode' },
    ],
  },
  {
    id: 'trio-challenge-2026',
    name: 'CYN Trio Challenge',
    status: 'ended',
    start: '2026-06-07',
    end: '2026-09-07',
    description:
      'Play Trio games with your official team. You can play public Trio games (teams of 3) or scrims against other teams (2, 4, 6, 8... teams, 3 players per team). You can set up your own scrims if you find 1 or more other teams.',
    reward:
      'Winning team gets a unique in-game pattern and becomes the CYN main team at the end of the event.',
    // Served straight from the repo (public/ files are copied to the site
    // root as-is) - unlike the old Discord CDN attachment link, this never
    // expires. Drop/replace the actual PNG at public/events/trio-challenge-2026.png.
    skinImageUrl: '/events/trio-challenge-2026.png',
    winner: 'Team CYN',
  },
]

/**
 * The events as the page sees them. An event with a time window (windowFrom / windowTo) changes its status by itself: upcoming until the start,
 * live until the end, then ended - so the CYN Hero Skin event goes live on 1 November 00:00 German time without a new release. Events without a
 * window keep the status written above.
 */
export const EVENTS: ClanEvent[] = EVENT_LIST.map((ev) => {
  if (!ev.windowFrom || !ev.windowTo) return ev
  const now = Date.now()
  // The dev copy of the site shows the event as live; what counts for the wheel is always only the window itself.
  const onDev = /^(dev\.|cynosure-dev\.)/.test(window.location.hostname)
  const status: ClanEvent['status'] = onDev ? 'live' : now < Date.parse(ev.windowFrom) ? 'upcoming' : now <= Date.parse(ev.windowTo) ? 'live' : 'ended'
  return { ...ev, status }
})

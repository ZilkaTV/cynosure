// Lifetime OpenFront stats of one player (attacks, boats, bombs, gold, units), from OpenFront's public
// GET /public/player/:id through our /api/of proxy. The response is a tree
// stats[gameType][gameMode][difficulty] = { wins, losses, total, stats: { attacks: [...], boats: {...}, ... } }
// with every counter as a decimal string; the index meanings are OpenFront's own (StatsSchemas.ts):
//   attacks [sent, received, cancelled, largest single incoming]   boats.* [sent, arrived, captured, destroyed, lost]
//   bombs.* [launched, landed, intercepted]                        gold [workers, war, trade, piracy, own trains, other trains, donations]
//   units.* [built, destroyed, captured, lost, upgraded]

const API_BASE = '/api/of'

export interface LifetimeStats {
  games: { wins: number; losses: number; total: number }
  attacks: { sent: number; received: number; cancelled: number; largestReceived: number }
  betrayals: number
  boats: { transportSent: number; transportArrived: number; tradeSent: number; tradeArrived: number; tradeCaptured: number; tradeDestroyed: number }
  bombs: { abombLaunched: number; abombLanded: number; hbombLaunched: number; hbombLanded: number; mirvLaunched: number; warheadsLanded: number; intercepted: number }
  gold: { workers: number; war: number; trade: number; piracy: number; trains: number }
  units: Record<string, number>
}

type Counters = string[] | undefined
interface RawBucket {
  wins?: string
  losses?: string
  total?: string
  stats?: {
    attacks?: Counters
    betrayals?: string
    boats?: Record<string, Counters>
    bombs?: Record<string, Counters>
    gold?: Counters
    units?: Record<string, Counters>
  }
}

const num = (arr: Counters, i: number) => Number(arr?.[i] ?? 0) || 0

export function aggregateLifetimeStats(raw: { stats?: Record<string, Record<string, Record<string, RawBucket>>> }): LifetimeStats {
  const out: LifetimeStats = {
    games: { wins: 0, losses: 0, total: 0 },
    attacks: { sent: 0, received: 0, cancelled: 0, largestReceived: 0 },
    betrayals: 0,
    boats: { transportSent: 0, transportArrived: 0, tradeSent: 0, tradeArrived: 0, tradeCaptured: 0, tradeDestroyed: 0 },
    bombs: { abombLaunched: 0, abombLanded: 0, hbombLaunched: 0, hbombLanded: 0, mirvLaunched: 0, warheadsLanded: 0, intercepted: 0 },
    gold: { workers: 0, war: 0, trade: 0, piracy: 0, trains: 0 },
    units: {},
  }
  for (const byMode of Object.values(raw.stats ?? {})) {
    for (const byDifficulty of Object.values(byMode ?? {})) {
      for (const b of Object.values(byDifficulty ?? {})) {
        out.games.wins += Number(b.wins ?? 0) || 0
        out.games.losses += Number(b.losses ?? 0) || 0
        out.games.total += Number(b.total ?? 0) || 0
        const s = b.stats
        if (!s) continue
        out.attacks.sent += num(s.attacks, 0)
        out.attacks.received += num(s.attacks, 1)
        out.attacks.cancelled += num(s.attacks, 2)
        out.attacks.largestReceived = Math.max(out.attacks.largestReceived, num(s.attacks, 3))
        out.betrayals += Number(s.betrayals ?? 0) || 0
        out.boats.transportSent += num(s.boats?.trans, 0)
        out.boats.transportArrived += num(s.boats?.trans, 1)
        out.boats.tradeSent += num(s.boats?.trade, 0)
        out.boats.tradeArrived += num(s.boats?.trade, 1)
        out.boats.tradeCaptured += num(s.boats?.trade, 2)
        out.boats.tradeDestroyed += num(s.boats?.trade, 3)
        out.bombs.abombLaunched += num(s.bombs?.abomb, 0)
        out.bombs.abombLanded += num(s.bombs?.abomb, 1)
        out.bombs.hbombLaunched += num(s.bombs?.hbomb, 0)
        out.bombs.hbombLanded += num(s.bombs?.hbomb, 1)
        out.bombs.mirvLaunched += num(s.bombs?.mirv, 0)
        out.bombs.warheadsLanded += num(s.bombs?.mirvw, 1)
        out.bombs.intercepted += num(s.bombs?.abomb, 2) + num(s.bombs?.hbomb, 2) + num(s.bombs?.mirvw, 2)
        out.gold.workers += num(s.gold, 0)
        out.gold.war += num(s.gold, 1)
        out.gold.trade += num(s.gold, 2)
        out.gold.piracy += num(s.gold, 3)
        out.gold.trains += num(s.gold, 4) + num(s.gold, 5)
        for (const [unit, counters] of Object.entries(s.units ?? {})) out.units[unit] = (out.units[unit] ?? 0) + num(counters, 0)
      }
    }
  }
  return out
}

const CACHE_MS = 30 * 60 * 1000
const memory = new Map<string, { at: number; stats: LifetimeStats }>()

/** Lifetime stats for a public id, cached in memory for 30 minutes (the proxy also caches for 30 minutes). */
export async function fetchLifetimeStats(publicId: string): Promise<LifetimeStats | null> {
  const hit = memory.get(publicId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.stats
  try {
    const res = await fetch(`${API_BASE}/public/player/${encodeURIComponent(publicId)}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const stats = aggregateLifetimeStats(await res.json())
    memory.set(publicId, { at: Date.now(), stats })
    return stats
  } catch {
    return null
  }
}

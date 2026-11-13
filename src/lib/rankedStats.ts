import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchGameMapSize, type PlayerGame } from './openfront'
import { idbGet, idbPut } from './rosterCache'

// Ranked 1v1 / 2v2 breakdown for the own profile: against whom (and with whom) the member played how often and won, on which map and in which
// mode (Compact / Normal). The game list only says win or loss, so every ranked game's report is read once (shared cache first, OpenFront
// itself for the rest) and boiled down to a tiny record that is kept in the browser for good.

export interface PersonRef {
  /** public id when the report has one, else the in-game name */
  key: string
  name: string
}
export interface RankedGameInfo {
  gameId: string
  ladder: '1v1' | '2v2'
  start: number
  map: string
  /** 'Compact' | 'Normal' | null when unknown */
  mapSize: string | null
  won: boolean
  opponents: PersonRef[]
  /** 2v2 only */
  partner: PersonRef | null
}

export interface RawPlayer {
  clientID: string
  username: string
  clanTag?: string | null
  publicID?: string | null
  teamIndex?: number
}
export interface RawGame {
  players: RawPlayer[]
  winners: string[]
  map: string
  mapSize: string | null
}

const ref = (p: RawPlayer): PersonRef => ({ key: p.publicID && p.publicID !== 'REDACTED' ? p.publicID : `n:${p.username}`, name: p.username })

/** One game boiled down to what the breakdown needs; null when the member cannot be found among the players. */
export function extractInfo(game: Pick<PlayerGame, 'gameId' | 'start' | 'result' | 'username' | 'clanTag' | 'rankedType' | 'map'>, memberId: string, raw: RawGame): RankedGameInfo | null {
  if (game.rankedType !== '1v1' && game.rankedType !== '2v2') return null
  const players = raw.players
  const me =
    players.find((p) => p.publicID === memberId) ??
    players.find((p) => p.username === game.username && (p.clanTag ?? null) === (game.clanTag ?? null)) ??
    players.find((p) => p.username === game.username)
  if (!me) return null
  const won = game.result === 'victory'
  const base = { gameId: game.gameId, start: new Date(game.start).getTime(), map: raw.map || game.map, mapSize: raw.mapSize, won }
  if (game.rankedType === '1v1') {
    return { ...base, ladder: '1v1', opponents: players.filter((p) => p !== me).map(ref), partner: null }
  }
  // 2v2: the team index when the report has one, else the winners (my team is the winning one after a win, the other one after a defeat)
  const hasIndex = me.teamIndex != null && players.every((p) => p.teamIndex != null)
  const sameTeam = hasIndex ? (p: RawPlayer) => p.teamIndex === me.teamIndex : (p: RawPlayer) => raw.winners.includes(p.clientID) === raw.winners.includes(me.clientID)
  const mine = players.filter((p) => p !== me && sameTeam(p))
  const others = players.filter((p) => p !== me && !mine.includes(p))
  return { ...base, ladder: '2v2', opponents: others.map(ref), partner: mine[0] ? ref(mine[0]) : null }
}

// ── breakdowns ─────────────────────────────────────────────────────────────

export interface Tally {
  key: string
  name: string
  games: number
  wins: number
  /** the games behind the numbers, newest first */
  list: RankedGameInfo[]
}

const byGames = (a: { games: number; wins: number; name: string }, b: { games: number; wins: number; name: string }) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name)

/** How often the member played against / with each person and how often won. */
export function tallyPeople(infos: RankedGameInfo[], pick: (i: RankedGameInfo) => PersonRef[]): Tally[] {
  const map = new Map<string, Tally>()
  for (const i of [...infos].sort((a, b) => b.start - a.start)) {
    for (const p of pick(i)) {
      const t = map.get(p.key) ?? { key: p.key, name: p.name, games: 0, wins: 0, list: [] }
      t.games += 1
      if (i.won) t.wins += 1
      t.list.push(i)
      t.name = p.name
      map.set(p.key, t)
    }
  }
  return [...map.values()].sort(byGames)
}

/** Map and mode (Compact / Normal) together: "Europe · Compact". */
export function tallyMaps(infos: RankedGameInfo[]): Tally[] {
  const map = new Map<string, Tally>()
  for (const i of [...infos].sort((a, b) => b.start - a.start)) {
    const name = i.mapSize ? `${i.map} · ${i.mapSize}` : i.map
    const t = map.get(name) ?? { key: name, name, games: 0, wins: 0, list: [] }
    t.games += 1
    if (i.won) t.wins += 1
    t.list.push(i)
    map.set(name, t)
  }
  return [...map.values()].sort(byGames)
}

/** Compact against Normal (and the games whose size is unknown). */
export function tallySizes(infos: RankedGameInfo[]): Tally[] {
  const map = new Map<string, Tally>()
  for (const i of infos) {
    const name = i.mapSize ?? '?'
    const t = map.get(name) ?? { key: name, name, games: 0, wins: 0, list: [] }
    t.games += 1
    if (i.won) t.wins += 1
    map.set(name, t)
  }
  return [...map.values()].sort(byGames)
}

// ── loading ────────────────────────────────────────────────────────────────

const STORE_KEY = (memberId: string) => `ranked-info-v1:${memberId}`
const MAX_GAMES = 250 // newest games per member; the older ones are left out to keep the first load short

function parseWinners(w: unknown): string[] {
  if (!Array.isArray(w)) return []
  return w[0] === 'team' ? (w.slice(2) as string[]) : w[0] === 'player' && typeof w[1] === 'string' ? [w[1]] : []
}

async function fetchShared(ids: string[]): Promise<Map<string, RawGame>> {
  const out = new Map<string, RawGame>()
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const res = await fetch(`/api/game-detail?ids=${encodeURIComponent(ids.slice(i, i + 100).join(','))}`)
      if (!res.ok) continue
      const data = (await res.json()) as Record<string, { players?: RawPlayer[]; winnerClientIds?: string[]; map?: string; mapSize?: string | null }>
      for (const [id, d] of Object.entries(data)) if (d?.players) out.set(id, { players: d.players, winners: d.winnerClientIds ?? [], map: d.map ?? '', mapSize: d.mapSize ?? null })
    } catch {
      /* the rest is read from OpenFront */
    }
  }
  return out
}

async function fetchLive(id: string): Promise<RawGame | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/of/public/game/${encodeURIComponent(id)}?turns=false`)
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, ((Number(res.headers.get('retry-after')) || 5) + 1) * 1000))
        continue
      }
      if (!res.ok) return null
      const json = (await res.json()) as { info?: { players?: RawPlayer[]; winner?: unknown; config?: { gameMap?: string; gameMapSize?: string } } }
      const info = json.info
      if (!info?.players) return null
      return { players: info.players, winners: parseWinners(info.winner), map: info.config?.gameMap ?? '', mapSize: info.config?.gameMapSize ?? null }
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  return null
}

export interface RankedLoad {
  infos: RankedGameInfo[]
  /** games whose report is already read */
  done: number
  total: number
  loading: boolean
}

/** The ranked games of one ladder with opponents/partner/map/size, filled in step by step (the finished ones are kept in the browser). */
export function useRankedInfos(memberId: string, games: PlayerGame[]): RankedLoad {
  const list = useMemo(
    () =>
      games
        .filter((g) => (g.rankedType === '1v1' || g.rankedType === '2v2') && g.result !== 'incomplete')
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
        .slice(0, MAX_GAMES),
    [games],
  )
  const key = list.map((g) => g.gameId).join(',')
  const [infos, setInfos] = useState<Map<string, RankedGameInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const asked = useRef<string>('')

  useEffect(() => {
    if (list.length === 0) {
      setInfos(new Map())
      setLoading(false)
      return
    }
    if (asked.current === key) return
    asked.current = key
    let alive = true
    setLoading(true)
    void (async () => {
      const kept = (await idbGet<Record<string, RankedGameInfo>>(STORE_KEY(memberId)).catch(() => null)) ?? {}
      const have = new Map<string, RankedGameInfo>()
      for (const g of list) {
        const k = kept[g.gameId]
        // the result of a kept game can still change in the list (an old 'defeat' that became 'incomplete' is dropped above); keep it in step
        if (k) have.set(g.gameId, { ...k, won: g.result === 'victory' })
      }
      if (alive) setInfos(new Map(have))
      const todo = list.filter((g) => !have.has(g.gameId))
      let added = false
      const add = (g: PlayerGame, raw: RawGame | null) => {
        if (!raw) return
        const info = extractInfo(g, memberId, raw)
        if (!info) return
        have.set(g.gameId, info)
        kept[g.gameId] = info
        added = true
      }
      if (todo.length > 0) {
        const shared = await fetchShared(todo.map((g) => g.gameId))
        for (const g of todo) add(g, shared.get(g.gameId) ?? null)
        if (alive) setInfos(new Map(have))
        const rest = todo.filter((g) => !have.has(g.gameId))
        const queue = [...rest]
        const worker = async () => {
          for (let g = queue.shift(); g; g = queue.shift()) {
            add(g, await fetchLive(g.gameId))
            if (alive) setInfos(new Map(have))
          }
        }
        await Promise.all([worker(), worker(), worker()])
        // reports of an older version do not say the map size: asked once per game
        for (const [id, info] of have) {
          if (info.mapSize === null) {
            const size = await fetchGameMapSize(id)
            if (size) {
              info.mapSize = size
              kept[id] = info
              added = true
            }
          }
        }
        if (alive) setInfos(new Map(have))
      }
      if (added) await idbPut(STORE_KEY(memberId), kept).catch(() => {})
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
      asked.current = ''
    }
    // list is derived from key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, memberId])

  const ordered = useMemo(() => list.map((g) => infos.get(g.gameId)).filter((x): x is RankedGameInfo => !!x), [list, infos])
  return { infos: ordered, done: ordered.length, total: list.length, loading }
}

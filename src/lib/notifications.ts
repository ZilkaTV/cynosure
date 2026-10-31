import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { supabase as db } from './supabase'
import { useProfile } from './useProfile'
import { useSharedRoster } from './access'
import { useIsAdmin } from './useSession'
import { QUESTS, fetchClaimsToday, periodKey, questPeriod } from './quests'
import { fetchReactedToday } from './reactions'
import { donationTotals, useClanDonors } from './clanDonors'
import { currentBoosterState } from './boosters'

// The notification bell (like on Facebook): who reacted to my games, who commented under them or answered my comments, who liked my profile
// or wrote on its wall, quests that can be collected, and (for admins) open reports. Nothing is stored for it: it reads the existing tables
// every few minutes. "Seen" is remembered per browser (localStorage), a quest or a report counts as new as long as it is waiting.

export type NoticeKind = 'game_reaction' | 'comment_reaction' | 'game_comment' | 'comment_reply' | 'profile_like' | 'profile_comment' | 'quest' | 'report'

export interface Notice {
  id: string
  kind: NoticeKind
  /** When it happened (ms); null for things that wait (quests, reports). */
  at: number | null
  /** OpenFront id of the member who did it. */
  who?: string
  /** The game, the emoji, the quest name, a number ... depending on the kind. */
  detail?: string
  /** Where a click leads (a full page load for games, so the report opens). */
  to: string
}

const SEEN_KEY = (me: string) => `cyn:notif-seen:${me}`
// quests and reports are "new" until they were seen once (they have no time): their ids are remembered here
const SEEN_WAITING_KEY = (me: string) => `cyn:notif-seen-waiting:${me}`
export const SOUND_KEY = 'cyn:notif-sound'
const POLL_MS = 90_000

export function readSeen(me: string): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY(me)))
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}
function readSeenWaiting(me: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_WAITING_KEY(me)) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
function writeSeenWaiting(me: string, ids: string[]) {
  try {
    localStorage.setItem(SEEN_WAITING_KEY(me), JSON.stringify(ids.slice(0, 50)))
  } catch {
    /* private window */
  }
}
export const soundEnabled = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0'
  } catch {
    return true
  }
}
function writeSeen(me: string, at: number) {
  try {
    localStorage.setItem(SEEN_KEY(me), String(at))
  } catch {
    /* private window: everything counts as new again next time */
  }
}

/** Everything that happened around this member, newest first (quests and reports on top). */
export async function fetchNotices(me: string, myGameIds: string[], isAdmin: boolean): Promise<Notice[]> {
  const out: Notice[] = []
  const t = (iso: string) => Date.parse(iso)

  // reactions to my games, one notice per game and person (all their emojis together)
  {
    const { data } = await db.from('cyn_kudos').select('game_id, from_openfront_id, emoji, created_at').eq('to_openfront_id', me).order('created_at', { ascending: false }).limit(60)
    const groups = new Map<string, Notice>()
    for (const r of (data as { game_id: string; from_openfront_id: string; emoji: string; created_at: string }[] | null) ?? []) {
      if (r.from_openfront_id === me) continue
      const key = `${r.game_id}|${r.from_openfront_id}`
      const g = groups.get(key)
      if (g) g.detail = `${g.detail ?? ''}${r.emoji}`
      else groups.set(key, { id: `kudos:${key}`, kind: 'game_reaction', at: t(r.created_at), who: r.from_openfront_id, detail: r.emoji, to: `/history?game=${r.game_id}` })
    }
    out.push(...groups.values())
  }

  // reactions to my comments and answers to them
  const { data: mine } = await db.from('cyn_game_comments').select('id, game_id').eq('author_openfront_id', me).order('created_at', { ascending: false }).limit(80)
  const myComments = new Map(((mine as { id: number; game_id: string }[] | null) ?? []).map((c) => [c.id, c.game_id]))
  if (myComments.size) {
    const idList = [...myComments.keys()]
    const [{ data: reacts }, { data: replies }] = await Promise.all([
      db.from('cyn_comment_reactions').select('comment_id, openfront_id, emoji, created_at').in('comment_id', idList).limit(100),
      db.from('cyn_game_comments').select('id, game_id, author_openfront_id, created_at').in('parent_id', idList).order('created_at', { ascending: false }).limit(40),
    ])
    for (const r of (reacts as { comment_id: number; openfront_id: string; emoji: string; created_at: string }[] | null) ?? []) {
      if (r.openfront_id === me) continue
      out.push({ id: `creact:${r.comment_id}:${r.openfront_id}:${r.emoji}`, kind: 'comment_reaction', at: t(r.created_at), who: r.openfront_id, detail: r.emoji, to: `/history?game=${myComments.get(r.comment_id)}` })
    }
    for (const r of (replies as { id: number; game_id: string; author_openfront_id: string; created_at: string }[] | null) ?? []) {
      if (r.author_openfront_id === me) continue
      out.push({ id: `reply:${r.id}`, kind: 'comment_reply', at: t(r.created_at), who: r.author_openfront_id, to: `/history?game=${r.game_id}` })
    }
  }

  // comments under the games I played
  if (myGameIds.length) {
    const { data } = await db.from('cyn_game_comments').select('id, game_id, author_openfront_id, parent_id, created_at').in('game_id', myGameIds.slice(0, 80)).order('created_at', { ascending: false }).limit(40)
    const known = new Set(out.filter((n) => n.kind === 'comment_reply').map((n) => n.id))
    for (const r of (data as { id: number; game_id: string; author_openfront_id: string; parent_id: number | null; created_at: string }[] | null) ?? []) {
      if (r.author_openfront_id === me || known.has(`reply:${r.id}`)) continue
      out.push({ id: `gcomment:${r.id}`, kind: 'game_comment', at: t(r.created_at), who: r.author_openfront_id, to: `/history?game=${r.game_id}` })
    }
  }

  // my profile: likes and the wall
  {
    const [{ data: likes }, { data: wall }] = await Promise.all([
      db.from('cyn_profile_likes').select('from_id, created_at').eq('profile_id', me).order('created_at', { ascending: false }).limit(20),
      db.from('cyn_profile_comments').select('id, author_openfront_id, created_at').eq('profile_id', me).order('created_at', { ascending: false }).limit(20),
    ])
    for (const r of (likes as { from_id: string; created_at: string }[] | null) ?? []) out.push({ id: `plike:${r.from_id}`, kind: 'profile_like', at: t(r.created_at), who: r.from_id, to: `/member/${me}` })
    for (const r of (wall as { id: number; author_openfront_id: string; created_at: string }[] | null) ?? []) {
      if (r.author_openfront_id !== me) out.push({ id: `pcomment:${r.id}`, kind: 'profile_comment', at: t(r.created_at), who: r.author_openfront_id, to: `/member/${me}#pinnwand` })
    }
  }

  if (isAdmin) {
    const { data } = await db.from('cyn_reports').select('id').eq('status', 'open').limit(50)
    const n = ((data as { id: number }[] | null) ?? []).length
    if (n > 0) out.push({ id: `reports:${n}`, kind: 'report', at: null, detail: String(n), to: '/reports' })
  }

  return out.sort((a, b) => (b.at ?? Infinity) - (a.at ?? Infinity)).slice(0, 60)
}

// How many quests can be claimed right now: the "Quests" entry of the menu glows by it.
let questsReady = 0
const questListeners = new Set<() => void>()
function publishQuestsReady(n: number) {
  if (n === questsReady) return
  questsReady = n
  questListeners.forEach((l) => l())
}
export function useQuestsReady(): number {
  return useSyncExternalStore(
    (cb) => {
      questListeners.add(cb)
      return () => questListeners.delete(cb)
    },
    () => questsReady,
  )
}
/** Something changed that can make a quest claimable (a booster was opened) or claimed: the list is looked at again. */
export const QUESTS_CHANGED = 'cyn:quests-changed'

/** The notices of the signed-in member, reloaded every few minutes while the page is open, with the unread count. */
export function useNotifications() {
  const { profile } = useProfile()
  const roster = useSharedRoster()
  const isAdmin = useIsAdmin()
  const donors = useClanDonors()
  const me = profile?.openfront_id
  const [notices, setNotices] = useState<Notice[]>([])
  const [claimable, setClaimable] = useState<{ id: string; key: string }[]>([])
  const [seen, setSeen] = useState(0)
  const [seenWaiting, setSeenWaiting] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const lastLoad = useRef(0)

  const member = roster?.members.find((m) => m.publicId === me)
  const gameIds = useMemo(
    () =>
      (member?.cynGames ?? [])
        .filter((g) => g.type !== 'Private')
        .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
        .slice(0, 80)
        .map((g) => g.gameId),
    [member],
  )
  const gameKey = gameIds.join(',')

  const load = useCallback(async () => {
    if (!me) return
    lastLoad.current = Date.now()
    setNotices(await fetchNotices(me, gameKey ? gameKey.split(',') : [], isAdmin))
    if (member && roster) {
      const [claims, reacted, booster] = await Promise.all([fetchClaimsToday(me), fetchReactedToday(me), currentBoosterState()])
      const ctx = { reactedToday: reacted, donated: donationTotals(donors, me), openedBooster: !!booster?.openedToday }
      const ready = QUESTS.filter((q) => q.check(member, roster.coopByGame, ctx) && !claims.has(q.id)).map((q) => ({ id: q.id, key: `${q.id}:${periodKey(questPeriod(q))}` }))
      setClaimable(ready)
      publishQuestsReady(ready.length)
    }
    setLoaded(true)
  }, [me, gameKey, isAdmin, member, roster, donors])

  useEffect(() => {
    if (!me) return
    const stored = readSeen(me)
    setSeenWaiting(readSeenWaiting(me))
    if (stored) setSeen(stored)
    else {
      // the first visit on this device: the past is not "new"
      writeSeen(me, Date.now())
      setSeen(Date.now())
    }
  }, [me])

  useEffect(() => {
    if (!me || !roster) return
    void load()
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && Date.now() - lastLoad.current > 2 * 60_000 && void load()
    document.addEventListener('visibilitychange', onVisible)
    const onQuests = () => void load()
    window.addEventListener(QUESTS_CHANGED, onQuests)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(QUESTS_CHANGED, onQuests)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, !!roster, gameKey])

  const all: Notice[] = useMemo(
    () => [...claimable.map((c): Notice => ({ id: `quest:${c.key}`, kind: 'quest', at: null, detail: c.id, to: '/quests' })), ...notices],
    [claimable, notices],
  )
  const isUnread = useCallback((n: Notice) => (n.at == null ? !seenWaiting.has(n.id) : n.at > seen), [seen, seenWaiting])
  const unread = all.filter(isUnread).length
  const markSeen = useCallback(() => {
    if (!me) return
    const now = Date.now()
    writeSeen(me, now)
    setSeen(now)
    const waiting = all.filter((n) => n.at == null).map((n) => n.id)
    writeSeenWaiting(me, waiting)
    setSeenWaiting(new Set(waiting))
  }, [me, all])
  return { notices: all, unread, seen, isUnread, markSeen, reload: load, loaded }
}

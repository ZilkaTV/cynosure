import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCardSocial } from './boosters'
import { fetchSnapshots } from './cardSnapshots'
import { capsDonatedMap, useClanDonors } from './clanDonors'
import { applySnapshot, computeCards, type CardSnapshot, type PlayerCardData } from './playerCard'
import { useProfile } from './useProfile'
import { useRoster } from './useRoster'

/**
 * The cards of all members: the values of the last monthly update where there is one, otherwise the values right now (from the roster, the donor
 * list and how much each wrote on the site). `live` are the values right now for everybody; null while they load.
 */
export function useCardData(): { cards: Map<string, PlayerCardData> | null; live: Map<string, PlayerCardData> | null; loading: boolean; reloadSnapshots: () => Promise<void> } {
  const { profile } = useProfile()
  const { data, loading } = useRoster(!!profile)
  const donors = useClanDonors()
  const [social, setSocial] = useState<Map<string, number> | null>(null)
  const [snapshots, setSnapshots] = useState<Record<string, CardSnapshot> | null>(null)
  useEffect(() => {
    if (!profile) return
    let alive = true
    void fetchCardSocial().then((c) => alive && setSocial(new Map(Object.entries(c))))
    void fetchSnapshots().then((s) => alive && setSnapshots(s))
    return () => {
      alive = false
    }
  }, [profile])
  const reloadSnapshots = useCallback(async () => setSnapshots(await fetchSnapshots()), [])
  const live = useMemo(() => (data ? computeCards(data.members, capsDonatedMap(donors), !!donors?.boards, social) : null), [data, donors, social])
  const cards = useMemo(() => {
    if (!live || !snapshots) return live
    const out = new Map<string, PlayerCardData>()
    for (const [id, card] of live) out.set(id, snapshots[id] ? applySnapshot(card, snapshots[id]) : card)
    return out
  }, [live, snapshots])
  return { cards, live, loading, reloadSnapshots }
}

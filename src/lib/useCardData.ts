import { useEffect, useMemo, useState } from 'react'
import { fetchCardSocial } from './boosters'
import { capsDonatedMap, useClanDonors } from './clanDonors'
import { computeCards, type PlayerCardData } from './playerCard'
import { useProfile } from './useProfile'
import { useRoster } from './useRoster'

/** The cards of all members (from the roster, the donor list and how much each wrote on the site); null while they load. */
export function useCardData(): { cards: Map<string, PlayerCardData> | null; loading: boolean } {
  const { profile } = useProfile()
  const { data, loading } = useRoster(!!profile)
  const donors = useClanDonors()
  const [social, setSocial] = useState<Map<string, number> | null>(null)
  useEffect(() => {
    if (!profile) return
    let alive = true
    void fetchCardSocial().then((c) => alive && setSocial(new Map(Object.entries(c))))
    return () => {
      alive = false
    }
  }, [profile])
  const cards = useMemo(() => (data ? computeCards(data.members, capsDonatedMap(donors), !!donors?.boards, social) : null), [data, donors, social])
  return { cards, loading }
}

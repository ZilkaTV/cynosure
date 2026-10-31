import { useProfile } from '../lib/useProfile'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import ClanDonations from '../components/ClanDonations'

/** The clan page: the donations of the clan (the full member list was taken out). */
export default function Clan() {
  const { profile } = useProfile()
  if (!profile) return <RegistrationGate />
  return (
    <StatsShell>
      <ClanDonations />
    </StatsShell>
  )
}

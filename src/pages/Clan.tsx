import { useProfile } from '../lib/useProfile'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import ClanDonations from '../components/ClanDonations'

/** The clan page: the donations of the clan (the member table, the games and the member changes were taken out; the CYN bot still records them). */
export default function Clan() {
  const { profile } = useProfile()
  if (!profile) return <RegistrationGate />
  return (
    <StatsShell>
      <ClanDonations />
    </StatsShell>
  )
}

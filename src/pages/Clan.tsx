import { useProfile } from '../lib/useProfile'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import ClanDonations from '../components/ClanDonations'
import ClanTracker from '../components/ClanTracker'

/** The clan page: the donations of the clan, then the games and the member changes the CYN bot records (the full member table was taken out). */
export default function Clan() {
  const { profile } = useProfile()
  if (!profile) return <RegistrationGate />
  return (
    <StatsShell>
      <ClanDonations />
      <ClanTracker />
    </StatsShell>
  )
}

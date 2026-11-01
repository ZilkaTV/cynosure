import type { Currency } from '../lib/clanDonors'

// OpenFront's own icons of the two clan currencies, kept in public/currency/ (served by this site, no call to their CDN).
const SRC: Record<Currency, string> = { soft: '/currency/caps.svg', hard: '/currency/plutonium.svg' }
const NAME: Record<Currency, string> = { soft: 'Caps', hard: 'Plutonium' }

/** Caps (soft currency) or plutonium (hard currency). */
export function CurrencyIcon({ currency, className = 'h-4 w-4' }: { currency: Currency; className?: string }) {
  return <img src={SRC[currency]} alt={NAME[currency]} title={NAME[currency]} className={`inline-block select-none align-middle ${className}`} draggable={false} />
}

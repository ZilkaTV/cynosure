import type { SVGProps } from 'react'

/** The icon of the Card Collector badge: two cards, the front one with a star. */
export function CardsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M9 2h9a2 2 0 0 1 2 2v13h-2V4H9z" />
      <path fillRule="evenodd" d="M6 5h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm4 4.2-1.1 2.3-2.5.3 1.9 1.7-.5 2.5L10 14.7l2.2 1.3-.5-2.5 1.9-1.7-2.5-.3z" />
    </svg>
  )
}

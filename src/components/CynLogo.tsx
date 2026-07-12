import { useState } from 'react'

/**
 * The CYN crest. Renders the real logo from /logo.png if you drop one in the
 * `public/` folder; otherwise falls back to this self-contained SVG rendition
 * of the shield (gold banner "CYN", cosmic-purple field, eagle, compass star).
 */
export default function CynLogo({ className = 'h-11 w-11' }: { className?: string }) {
  const [useImg, setUseImg] = useState(true)

  if (useImg) {
    return (
      <img
        src="/logo.png"
        alt="Cynosure crest"
        className={`${className} object-contain`}
        onError={() => setUseImg(false)}
      />
    )
  }

  return (
    <svg className={className} viewBox="0 0 100 116" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cynosure crest">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eed699" />
          <stop offset="1" stopColor="#b0913f" />
        </linearGradient>
        <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a2f8f" />
          <stop offset="1" stopColor="#140c26" />
        </linearGradient>
      </defs>
      {/* shield body */}
      <path
        d="M8 18 50 8l42 10v40c0 28-20 44-42 52C28 102 8 86 8 58z"
        fill="url(#field)"
        stroke="url(#gold)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* top banner */}
      <path d="M6 14h88l-6 16H12z" fill="url(#gold)" stroke="#8a6f2e" strokeWidth="1.5" />
      <text
        x="50"
        y="27"
        textAnchor="middle"
        fontFamily="Cinzel, serif"
        fontWeight="700"
        fontSize="15"
        fill="#2a1b56"
        letterSpacing="1"
      >
        CYN
      </text>
      {/* eagle silhouette (stylised) */}
      <path
        d="M30 52c8-3 14-2 20 2 4-6 10-8 18-7-5 2-7 5-8 9 4 1 7 3 9 7-6-2-11-2-16 1-3 5-8 8-15 8 4-3 6-6 6-10-6 1-11-1-14-6z"
        fill="#1a1230"
        opacity="0.85"
      />
      {/* compass / north star */}
      <path
        d="M50 74 53 84 63 87 53 90 50 100 47 90 37 87 47 84z"
        fill="#c9ccd6"
      />
    </svg>
  )
}

import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSharedRoster } from '../lib/access'
import { useProfile } from '../lib/useProfile'
import { cleanDisplayName } from '../lib/displayName'
import { useLanguage } from '../i18n/LanguageContext'

/** Header box: type a [CYN] member's name or OpenFront id and go straight to their profile. */
export default function ProfileSearch({ className = '' }: { className?: string }) {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const roster = useSharedRoster()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return []
    const list = roster?.members ?? []
    const score = (m: (typeof list)[number]) => {
      const name = cleanDisplayName(m.name).toLowerCase()
      if (m.publicId.toLowerCase() === q || name === q) return 0
      if (name.startsWith(q)) return 1
      if (name.includes(q) || m.name.toLowerCase().includes(q) || m.publicId.toLowerCase().includes(q) || (m.accountUsername ?? '').toLowerCase().includes(q)) return 2
      return 9
    }
    return list
      .map((m) => ({ m, s: score(m) }))
      .filter((x) => x.s < 9)
      .sort((a, b) => a.s - b.s || a.m.name.localeCompare(b.m.name))
      .slice(0, 6)
      .map((x) => x.m)
  }, [q, roster])

  if (!profile) return null

  const go = (id: string) => {
    setQuery('')
    setFocused(false)
    navigate(`/member/${id}`)
  }
  const placeholder = language === 'de' ? 'Profil suchen: Name oder ID' : 'Find a profile: name or ID'

  return (
    <div ref={box} className={`relative ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const pick = matches[active]
            // An id that is not on the loaded roster is tried as typed (the profile page says if it does not exist).
            if (pick) go(pick.publicId)
            else if (/^[A-Za-z0-9]{6,12}$/.test(query.trim())) go(query.trim())
          } else if (e.key === 'Escape') {
            setQuery('')
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        aria-label={placeholder}
        placeholder={placeholder}
        className="w-full rounded-lg border border-base-600 bg-base-800/80 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
      />
      {focused && q && (
        <ul className="absolute left-0 top-full z-50 mt-1 w-full min-w-[14rem] overflow-hidden rounded-lg border border-base-600 bg-base-850 shadow-xl">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{language === 'de' ? 'Kein Mitglied gefunden' : 'No member found'}</li>
          ) : (
            matches.map((m, i) => (
              <li key={m.publicId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(m.publicId)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-base-800' : 'hover:bg-base-800'}`}
                >
                  <span className="truncate text-white">{cleanDisplayName(m.name)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{m.publicId}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

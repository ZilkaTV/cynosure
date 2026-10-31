import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSharedRoster } from '../lib/access'
import { useProfile } from '../lib/useProfile'
import { cleanDisplayName } from '../lib/displayName'
import { addRecentSearch, removeRecentSearch, toggleFavoriteProfile, useSearchLists } from '../lib/searchLists'
import { useLanguage } from '../i18n/LanguageContext'
import { RoleName, useWinsIndex } from './RoleName'

interface Row {
  id: string
  name: string
}

const star = (filled: boolean) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
)

/**
 * Header box: type a [CYN] member's name or OpenFront id and go straight to their profile. Clicking into the empty box shows, like op.gg, the profiles
 * searched for last and the favourites (a star on a row or on a profile page puts it in the favourites).
 */
export default function ProfileSearch({ className = '' }: { className?: string }) {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const de = language === 'de'
  const roster = useSharedRoster()
  const wins = useWinsIndex()
  const navigate = useNavigate()
  const { recent, favs } = useSearchLists()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const [tab, setTab] = useState<'recent' | 'favs'>('recent')
  const box = useRef<HTMLDivElement>(null)

  const nameOf = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])
  const row = (id: string): Row => ({ id, name: cleanDisplayName(nameOf.get(id) ?? id) })

  const q = query.trim().toLowerCase()
  const matches = useMemo<Row[]>(() => {
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
      .map((x) => ({ id: x.m.publicId, name: cleanDisplayName(x.m.name) }))
  }, [q, roster])

  if (!profile) return null

  const shown: Row[] = q ? matches : (tab === 'recent' ? recent : favs).map(row)
  const go = (id: string) => {
    addRecentSearch(id)
    setQuery('')
    setFocused(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
    navigate(`/member/${id}`)
  }
  const placeholder = de ? 'Profil suchen: Name oder ID' : 'Find a profile: name or ID'
  const keep = (e: React.MouseEvent) => e.preventDefault() // a click on the list must not take the focus away from the box

  return (
    <div ref={box} className={`relative ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setFocused(true)
        }}
        onFocus={() => setFocused(true)}
        onClick={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, shown.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const pick = shown[active]
            // An id that is not on the loaded roster is tried as typed (the profile page says if it does not exist).
            if (pick) go(pick.id)
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
      {focused && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[17rem] overflow-hidden rounded-lg border border-base-600 bg-base-850 shadow-xl">
          {!q && (
            <div className="grid grid-cols-2 border-b border-base-700 text-xs font-semibold" role="tablist">
              {(
                [
                  ['recent', de ? 'Zuletzt gesucht' : 'Recent searches'],
                  ['favs', de ? 'Favoriten' : 'Favorites'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onMouseDown={keep}
                  onClick={() => {
                    setTab(key)
                    setActive(0)
                  }}
                  className={`px-3 py-2 transition-colors ${tab === key ? 'bg-base-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              {q ? (de ? 'Kein Mitglied gefunden' : 'No member found') : tab === 'recent' ? (de ? 'Noch keine Suchen.' : 'No searches yet.') : de ? 'Noch keine Favoriten. Mit dem Stern merkst du dir Profile.' : 'No favorites yet. Use the star to keep profiles here.'}
            </p>
          ) : (
            <ul>
              {shown.map((r, i) => {
                const fav = favs.includes(r.id)
                return (
                  <li key={r.id} className={`flex items-center ${i === active ? 'bg-base-800' : 'hover:bg-base-800'}`}>
                    <button type="button" onMouseDown={keep} onClick={() => go(r.id)} className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm">
                      <span className="truncate text-white">
                        <RoleName wins={wins.byId.get(r.id)}>{r.name}</RoleName>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">{r.id}</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={keep}
                      onClick={() => toggleFavoriteProfile(r.id)}
                      title={fav ? (de ? 'Aus den Favoriten nehmen' : 'Remove from favorites') : de ? 'Zu den Favoriten' : 'Add to favorites'}
                      aria-label={fav ? (de ? 'Aus den Favoriten nehmen' : 'Remove from favorites') : de ? 'Zu den Favoriten' : 'Add to favorites'}
                      aria-pressed={fav}
                      className={`shrink-0 px-2 py-2 transition-colors ${fav ? 'text-gold-light' : 'text-slate-500 hover:text-gold-light'}`}
                    >
                      {star(fav)}
                    </button>
                    {!q && tab === 'recent' && (
                      <button
                        type="button"
                        onMouseDown={keep}
                        onClick={() => removeRecentSearch(r.id)}
                        title={de ? 'Aus dem Verlauf löschen' : 'Remove from history'}
                        aria-label={de ? 'Aus dem Verlauf löschen' : 'Remove from history'}
                        className="shrink-0 px-2 py-2 text-slate-500 transition-colors hover:text-signal-red"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

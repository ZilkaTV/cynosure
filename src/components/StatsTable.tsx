import { useMemo, useState, type ReactNode } from 'react'
import type { MemberStats } from '../lib/stats'
import { useLanguage } from '../i18n/LanguageContext'

export interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  render: (m: MemberStats, rank: number) => ReactNode
  sortValue?: (m: MemberStats) => number | string
}

const ALIGN_CLASS = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function StatsTable({
  members,
  columns,
  defaultSort,
  emptyLabel,
  limit,
  searchable = false,
}: {
  members: MemberStats[]
  columns: Column[]
  defaultSort: string
  emptyLabel?: string
  /** Show only the first `limit` rows until the visitor expands the table. */
  limit?: number
  /** A search box above the table: player name or OpenFront id. */
  searchable?: boolean
}) {
  const { t } = useLanguage()
  const [sortKey, setSortKey] = useState(defaultSort)
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return members
    const arr = [...members].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      return String(av).localeCompare(String(bv))
    })
    return dir === 'desc' ? arr.reverse() : arr
  }, [members, columns, sortKey, dir])

  const q = query.trim().toLowerCase()
  // Ranks stay those of the full sorted list, also while a search narrows the rows down.
  const rankOf = useMemo(() => new Map(sorted.map((m, i) => [m.publicId, i + 1])), [sorted])
  const matches = q
    ? sorted.filter((m) => m.name.toLowerCase().includes(q) || m.publicId.toLowerCase().includes(q) || (m.accountUsername ?? '').toLowerCase().includes(q))
    : sorted
  const collapsed = limit != null && !expanded && !q && sorted.length > limit
  const visible = collapsed ? sorted.slice(0, limit) : matches

  function toggle(key: string) {
    if (key === sortKey) setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortKey(key)
      setDir('desc')
    }
  }

  if (members.length === 0) {
    return <p className="panel px-5 py-8 text-center text-sm text-slate-500">{emptyLabel ?? t.common.noMembersYet}</p>
  }

  return (
    <div className="space-y-2">
      {searchable && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.common.searchPlayerOrId}
            placeholder={t.common.searchPlayerOrId}
            className="w-full max-w-sm rounded-lg border border-base-600 bg-base-800 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          {q && <span className="text-xs text-slate-500">{t.common.searchResults(matches.length, sorted.length)}</span>}
        </div>
      )}
      <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-base-700 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2.5 font-semibold">#</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2.5 font-semibold ${ALIGN_CLASS[c.align ?? 'left']}`}
                >
                  {c.sortValue ? (
                    <button
                      onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-white ${sortKey === c.key ? 'text-white' : ''}`}
                    >
                      {c.label}
                      {sortKey === c.key && <span className="text-accent-light">{dir === 'desc' ? '▾' : '▴'}</span>}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => {
              const rank = rankOf.get(m.publicId) ?? 0
              return (
                <tr key={m.publicId} className="border-b border-base-700/50 transition-colors last:border-0 hover:bg-base-800/40">
                  <td className="px-3 py-2.5 font-display font-bold text-slate-500">{rank}</td>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2.5 ${ALIGN_CLASS[c.align ?? 'left']}`}>
                      {c.render(m, rank)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-sm text-slate-500">
                  {t.common.searchNoMatch}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
      {limit != null && !q && sorted.length > limit && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="rounded-lg bg-base-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-base-700 hover:text-white"
          >
            {expanded ? t.common.showTopOnly(limit) : t.common.showAll(sorted.length)}
          </button>
        </div>
      )}
    </div>
  )
}

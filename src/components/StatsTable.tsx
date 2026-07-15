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
}: {
  members: MemberStats[]
  columns: Column[]
  defaultSort: string
  emptyLabel?: string
}) {
  const { t } = useLanguage()
  const [sortKey, setSortKey] = useState(defaultSort)
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

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
            {sorted.map((m, i) => (
              <tr key={m.publicId} className="border-b border-base-700/50 transition-colors last:border-0 hover:bg-base-800/40">
                <td className="px-3 py-2.5 font-display font-bold text-slate-500">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 ${ALIGN_CLASS[c.align ?? 'left']}`}>
                    {c.render(m, i + 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

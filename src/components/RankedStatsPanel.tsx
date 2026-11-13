import { useState } from 'react'
import type { PlayerGame } from '../lib/openfront'
import { tallyMaps, tallyPeople, tallySizes, useRankedInfos, type RankedGameInfo, type Tally } from '../lib/rankedStats'
import { cleanDisplayName } from '../lib/displayName'
import { CLAN_TAG } from '../config'

const pct = (wins: number, games: number) => (games > 0 ? `${Math.round((wins / games) * 100)}%` : '-')
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
const where = (i: RankedGameInfo) => (i.mapSize ? `${i.map} · ${i.mapSize}` : i.map)

/** One ranking ("against whom", "with whom", "maps"): the first rows, a button for the rest, and a click on a row lists its games. */
function TallyList({ title, hint, rows, detail, de, first = 8 }: { title: string; hint?: string; rows: Tally[]; detail: (i: RankedGameInfo) => string; de: boolean; first?: number }) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  if (rows.length === 0) return null
  const shown = all ? rows : rows.slice(0, first)
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-base-700 px-4 py-2.5">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-gold">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <ul>
        {shown.map((r) => (
          <li key={r.key} className="border-b border-base-700/50 last:border-0">
            <button type="button" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-base-800/50">
              <span className="min-w-0 truncate font-medium text-white">{cleanDisplayName(r.name)}</span>
              <span className="flex shrink-0 items-center gap-3 tabular-nums">
                <span className="text-slate-400">
                  {r.games} {de ? (r.games === 1 ? 'Spiel' : 'Spiele') : r.games === 1 ? 'game' : 'games'}
                </span>
                <span className="w-16 text-right text-signal-green">{r.wins}W</span>
                <span className="w-10 text-right text-signal-red">{r.games - r.wins}L</span>
                <span className={`w-10 text-right font-semibold ${r.wins * 2 >= r.games ? 'text-signal-green' : 'text-signal-red'}`}>{pct(r.wins, r.games)}</span>
              </span>
            </button>
            {open === r.key && (
              <ul className="space-y-0.5 bg-base-900/50 px-4 py-2 text-xs">
                {r.list.slice(0, 30).map((i) => (
                  <li key={i.gameId} className="flex items-center justify-between gap-3">
                    <span className="tabular-nums text-slate-500">{day(i.start)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-300">
                      {where(i)}
                      {detail(i) && <span className="text-slate-500"> · {detail(i)}</span>}
                    </span>
                    <span className={`w-14 text-right font-semibold ${i.won ? 'text-signal-green' : 'text-signal-red'}`}>{i.won ? (de ? 'Sieg' : 'win') : de ? 'Niederlage' : 'loss'}</span>
                  </li>
                ))}
                {r.list.length > 30 && <li className="text-slate-500">+{r.list.length - 30}</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {rows.length > first && (
        <div className="border-t border-base-700 px-4 py-2 text-center">
          <button type="button" onClick={() => setAll((v) => !v)} className="btn-ghost text-xs">
            {all ? (de ? `Nur die Top ${first}` : `Top ${first} only`) : de ? `Mehr anzeigen (${rows.length})` : `Show more (${rows.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

/** Ranked 1v1 or 2v2 of the own profile: who was played against (and with), on which map and in which mode. `games` must be a stable array. */
export default function RankedStatsPanel({ ladder, memberId, games, de }: { ladder: '1v1' | '2v2'; memberId: string; games: PlayerGame[]; de: boolean }) {
  const { infos, done, total, loading } = useRankedInfos(memberId, games)
  const wins = infos.filter((i) => i.won).length
  const sizes = tallySizes(infos).filter((s) => s.name !== '?')

  if (total === 0) {
    return <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-6 text-center text-sm text-slate-500">{de ? `Noch keine ${ladder}-Spiele mit [${CLAN_TAG}]-Tag.` : `No ${ladder} games with the [${CLAN_TAG}] tag yet.`}</p>
  }
  return (
    <div className="space-y-4">
      <div className="panel px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl font-bold text-white">
              {infos.length} <span className="text-base font-normal text-slate-400">{de ? 'Spiele' : 'games'}</span>
            </p>
            <p className="text-sm">
              <span className="text-signal-green">{wins}W</span> <span className="text-signal-red">{infos.length - wins}L</span> <span className="text-slate-400">· {pct(wins, infos.length)}</span>
            </p>
          </div>
          {sizes.length > 0 && (
            <div className="flex gap-2">
              {sizes.map((s) => (
                <div key={s.name} className="rounded-lg border border-base-700 bg-base-850/40 px-3 py-1.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{s.name}</p>
                  <p className="text-sm font-bold tabular-nums text-white">
                    {s.wins}/{s.games} <span className="font-normal text-slate-400">{pct(s.wins, s.games)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        {loading && (
          <p className="mt-2 text-xs text-slate-500">
            {de ? 'Lade Spielberichte' : 'Loading game reports'}… {done}/{total}
          </p>
        )}
        {!loading && done < total && (
          <p className="mt-2 text-xs text-slate-500">{de ? `Für ${total - done} Spiele gab es keinen lesbaren Bericht.` : `${total - done} games had no readable report.`}</p>
        )}
      </div>

      {ladder === '2v2' && (
        <TallyList
          title={de ? 'Mit wem du gespielt hast' : 'Who you played with'}
          hint={de ? 'Dein Partner im 2v2, Klick zeigt die Spiele.' : 'Your 2v2 partner. Click a row for the games.'}
          rows={tallyPeople(infos, (i) => (i.partner ? [i.partner] : []))}
          detail={(i) => (i.opponents.length ? `${de ? 'gegen' : 'vs'} ${i.opponents.map((o) => cleanDisplayName(o.name)).join(' & ')}` : '')}
          de={de}
        />
      )}
      <TallyList
        title={de ? 'Gegen wen du gespielt hast' : 'Who you played against'}
        hint={de ? 'Wie oft du gegen jeden gespielt und gewonnen hast. Klick zeigt Map und Modus.' : 'How often you played and won against each. Click a row for map and mode.'}
        rows={tallyPeople(infos, (i) => i.opponents)}
        detail={(i) => (ladder === '2v2' && i.partner ? `${de ? 'mit' : 'with'} ${cleanDisplayName(i.partner.name)}` : '')}
        de={de}
      />
      <TallyList
        title={de ? 'Maps und Modus' : 'Maps and mode'}
        hint={de ? 'Compact oder Normal, mit deiner Bilanz je Map.' : 'Compact or Normal, with your record on each map.'}
        rows={tallyMaps(infos)}
        detail={(i) => (i.opponents.length ? `${de ? 'gegen' : 'vs'} ${i.opponents.map((o) => cleanDisplayName(o.name)).join(' & ')}` : '')}
        de={de}
      />
      <p className="text-center text-xs text-slate-500">{de ? `Gezählt werden Spiele, in denen du mit dem [${CLAN_TAG}]-Tag gespielt hast.` : `Counted are games you played with the [${CLAN_TAG}] tag.`}</p>
    </div>
  )
}

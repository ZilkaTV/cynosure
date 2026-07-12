import { useEffect, useState } from 'react'
import { fetchGameDetail, type GameDetail, type GamePlayerStat } from '../lib/openfront'
import { CLAN_TAG } from '../config'

function fmt(n: number): string {
  if (!isFinite(n) || n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${Math.round(n)}`
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}

function num(v: string | undefined): number {
  return v ? Number(v) : 0
}

export default function GameDetailModal({ gameId, onClose }: { gameId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!gameId) return
    setState('loading')
    setDetail(null)
    fetchGameDetail(gameId)
      .then((d) => {
        if (d) {
          setDetail(d)
          setState('ok')
        } else setState('error')
      })
      .catch(() => setState('error'))
  }, [gameId])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  if (!gameId) return null

  const durMin = detail ? detail.durationSeconds / 60 : 1
  const tickRate = detail && detail.durationSeconds ? detail.numTurns / detail.durationSeconds : 10

  const byId = new Map<string, GamePlayerStat>()
  detail?.players.forEach((p) => byId.set(p.clientID, p))
  const nameOf = (clientID: string) => byId.get(clientID)?.username ?? 'Unknown'
  const winner = detail?.winnerClientId ? byId.get(detail.winnerClientId) : null

  const rows = (detail?.players ?? [])
    .map((p) => {
      const st = p.stats ?? {}
      const goldTotal = (st.gold ?? []).reduce((s, g) => s + num(g), 0)
      const kills = st.kills ?? []
      const killedAt = st.killedAt ? num(st.killedAt) : null
      return {
        p,
        out: num(st.attacks?.[0]),
        inc: num(st.attacks?.[1]),
        gold: goldTotal,
        kills: kills.length,
        victims: kills.map((k) => nameOf(k.victim)),
        deathSec: killedAt != null ? killedAt / tickRate : null,
        isWinner: detail?.winnerClientId === p.clientID,
      }
    })
    .sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || b.kills - a.kills || b.gold - a.gold)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-4xl rounded-2xl border border-base-600 bg-base-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-700 px-6 py-4">
          <h2 className="font-display text-xl font-bold text-white">Post Game Report</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label="Close">✕</button>
        </div>

        {state === 'loading' && <p className="px-6 py-16 text-center text-slate-400">Loading game…</p>}
        {state === 'error' && <p className="px-6 py-16 text-center text-slate-400">Couldn’t load this game from OpenFront.</p>}

        {state === 'ok' && detail && (
          <div className="p-6">
            {/* header tiles */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Duration" value={fmtDuration(detail.durationSeconds)} />
              <Tile label="Winner" value={winner?.username ?? '—'} accent />
              <Tile label="Players" value={String(detail.players.length)} />
              <Tile label="Map" value={detail.map} />
            </div>
            <p className="mb-4 text-center text-xs text-slate-500">
              Game ID <span className="font-mono text-slate-300">{detail.gameId}</span>
              {detail.start ? ` · ${new Date(detail.start).toLocaleString('en-GB')}` : ''}
            </p>

            <div className="overflow-x-auto rounded-xl border border-base-700">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2.5 text-left font-semibold">#</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Player</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Out/min</th>
                    <th className="px-3 py-2.5 text-right font-semibold">In/min</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Gold/min</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Kills</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Death</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isCyn = r.p.clanTag === CLAN_TAG
                    return (
                      <tr key={r.p.clientID} className={`border-b border-base-700/50 last:border-0 ${isCyn ? 'bg-accent/5' : ''}`}>
                        <td className="px-3 py-2 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className={isCyn ? 'font-semibold text-accent-light' : 'text-slate-200'}>
                            {r.p.clanTag && <span className="text-slate-500">[{r.p.clanTag}] </span>}
                            {r.p.username}
                            {r.isWinner && <span title="Winner"> 👑</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.out / durMin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.inc / durMin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gold-light">{fmt(r.gold / durMin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.kills > 0 ? (
                            <span
                              className="cursor-help font-semibold text-white underline decoration-dotted underline-offset-2"
                              title={`Killed: ${r.victims.join(', ')}`}
                            >
                              {r.kills}
                            </span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {r.deathSec != null ? fmtDuration(r.deathSec) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              Hover a Kills number to see who was eliminated. Out/In = attack troops sent/received per minute;
              Gold/min = total gold earned per minute. (Max/end tiles aren’t in OpenFront’s public API.)
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-base-700 bg-base-850/60 px-4 py-3 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-bold ${accent ? 'text-accent-light' : 'text-white'}`}>{value}</p>
    </div>
  )
}

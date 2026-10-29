import { useEffect, useMemo, useRef, useState } from 'react'
import { useSharedRoster } from '../lib/access'
import { fetchBoosters } from '../lib/chat'
import { computeRaffleEntries, type RaffleEntry } from '../lib/raffle'
import { useIsAdmin } from '../lib/useSession'
import { useLanguage } from '../i18n/LanguageContext'
import { cleanDisplayName } from '../lib/displayName'

const COLORS = ['#ffb454', '#4fd1c0', '#f2718c', '#7c9eff', '#c2e86b', '#d68cff', '#ffd166', '#5ad1a5', '#ff9f6b', '#8fb8ff']
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: n % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })
const luminance = (hex: string) => (0.299 * parseInt(hex.slice(1, 3), 16) + 0.587 * parseInt(hex.slice(3, 5), 16) + 0.114 * parseInt(hex.slice(5, 7), 16)) / 255
const SPIN_MS = 5200
const TOP_ROWS = 10

/** The draw wheel of the CYN Hero Skin event: not everybody has the same odds. The entries come from the site's stats, only admins can spin. */
export default function FactorWheel({ fromMs, toMs }: { fromMs: number; toMs: number }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const isAdmin = useIsAdmin()
  const roster = useSharedRoster()
  const [boosters, setBoosters] = useState<Set<string> | null>(null)
  const [entries, setEntries] = useState<RaffleEntry[] | null>(null)
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<{ entry: RaffleEntry; chance: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const confetti = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetchBoosters()
      .then((ids) => setBoosters(new Set(ids)))
      .catch(() => setBoosters(new Set()))
  }, [])

  useEffect(() => {
    if (!roster || !boosters) return
    let alive = true
    computeRaffleEntries(roster.members, boosters, fromMs, toMs).then((e) => alive && setEntries(e))
    return () => {
      alive = false
    }
  }, [roster, boosters, fromMs, toMs])

  const live = useMemo(() => (entries ?? []).filter((e) => !removed.has(e.id)), [entries, removed])
  const total = live.reduce((s, e) => s + e.weight, 0)

  // draw the wheel
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const size = c.width
    const cx = size / 2
    const r = size / 2 - 6
    ctx.clearRect(0, 0, size, size)
    if (live.length === 0 || total <= 0) {
      ctx.beginPath()
      ctx.arc(cx, cx, r, 0, Math.PI * 2)
      ctx.fillStyle = '#20232f'
      ctx.fill()
      return
    }
    let start = -Math.PI / 2
    live.forEach((e, i) => {
      const end = start + (e.weight / total) * Math.PI * 2
      const color = COLORS[i % COLORS.length]
      ctx.beginPath()
      ctx.moveTo(cx, cx)
      ctx.arc(cx, cx, r, start, end)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = '#0f1016'
      ctx.stroke()
      // the name, only where the slice is wide enough to read it
      if (end - start > 0.09) {
        ctx.save()
        ctx.translate(cx, cx)
        ctx.rotate((start + end) / 2)
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = luminance(color) > 0.55 ? '#1c1d29' : '#ffffff'
        ctx.font = `600 ${Math.round(size * 0.032)}px Inter, sans-serif`
        const label = cleanDisplayName(e.name)
        ctx.fillText(label.length > 16 ? label.slice(0, 15) + '…' : label, r - 22, 0)
        ctx.restore()
      }
      start = end
    })
  }, [live, total])

  function chime() {
    try {
      const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const now = ac.currentTime
      ;[523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, now + i * 0.09)
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.09 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.5)
        osc.connect(gain).connect(ac.destination)
        osc.start(now + i * 0.09)
        osc.stop(now + i * 0.09 + 0.55)
      })
    } catch {
      /* no audio */
    }
  }

  function launchConfetti() {
    const c = confetti.current
    if (!c || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    c.width = window.innerWidth
    c.height = window.innerHeight
    const ctx = c.getContext('2d')
    if (!ctx) return
    const parts = Array.from({ length: 80 }, () => ({
      x: c.width / 2 + (Math.random() - 0.5) * 160,
      y: c.height * 0.3,
      vx: (Math.random() - 0.5) * 7,
      vy: Math.random() * -5 - 2,
      g: 0.17 + Math.random() * 0.05,
      s: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    }))
    const step = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      let alive = false
      for (const p of parts) {
        p.vy += p.g
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        if (p.y < c.height + 20) alive = true
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6)
        ctx.restore()
      }
      if (alive) requestAnimationFrame(step)
      else ctx.clearRect(0, 0, c.width, c.height)
    }
    requestAnimationFrame(step)
  }

  function spin() {
    if (!isAdmin || spinning || live.length < 2 || total <= 0) return
    setSpinning(true)
    setWinner(null)
    // weighted pick
    let pick = Math.random() * total
    let idx = live.length - 1
    for (let i = 0; i < live.length; i++) {
      pick -= live[i].weight
      if (pick <= 0) {
        idx = i
        break
      }
    }
    const before = live.slice(0, idx).reduce((s, e) => s + e.weight, 0)
    const spanDeg = (live[idx].weight / total) * 360
    const centerDeg = ((before + live[idx].weight / 2) / total) * 360
    const jitter = (Math.random() - 0.5) * Math.min(spanDeg * 0.6, 24)
    const cur = ((rotation % 360) + 360) % 360
    const delta = (((-(centerDeg + jitter)) - cur + 3600) % 360)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setRotation(rotation + (reduced ? 1 : 6 + Math.floor(Math.random() * 3)) * 360 + delta)
    window.setTimeout(
      () => {
        setSpinning(false)
        setWinner({ entry: live[idx], chance: (live[idx].weight / total) * 100 })
        chime()
        launchConfetti()
      },
      (reduced ? 900 : SPIN_MS) + 80,
    )
  }

  const rows = showAll ? live : live.slice(0, TOP_ROWS)
  const colorOf = (id: string) => COLORS[live.findIndex((e) => e.id === id) % COLORS.length]

  return (
    <div className="space-y-4">
      <canvas ref={confetti} className="pointer-events-none fixed inset-0 z-[120]" />
      <p className="text-sm text-slate-400">
        {de
          ? 'Das Rad wird automatisch aus den Seiten-Statistiken gefüllt: Team-Spiele im Event-Zeitraum, bei denen mindestens ein anderes CYN-Mitglied dabei war.'
          : "The wheel fills itself from the site's stats: team games inside the event window in which at least one other CYN member played."}
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-[420px]" style={{ aspectRatio: '1' }}>
            <svg className="absolute -top-2 left-1/2 z-10 h-12 w-10 -translate-x-1/2 drop-shadow-lg" viewBox="0 0 34 40" aria-hidden="true">
              <path d="M17 40 L2 6 Q17 -6 32 6 Z" fill="#ffb454" stroke="#181a24" strokeWidth="2" />
            </svg>
            <div style={{ transform: `rotate(${rotation}deg)`, transition: `transform ${SPIN_MS}ms cubic-bezier(.14,.72,.11,1)`, willChange: 'transform' }} className="h-full w-full rounded-full">
              <canvas ref={canvas} width={960} height={960} className="block h-full w-full rounded-full" />
            </div>
            <div className="absolute left-1/2 top-1/2 h-[15%] w-[15%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-gold bg-base-900 shadow-lg" />
          </div>
          {isAdmin && (
            <button type="button" onClick={spin} disabled={spinning || live.length < 2} className="btn-accent !px-10 !py-3 font-display text-2xl tracking-wide disabled:opacity-45">
              SPIN
            </button>
          )}
          <p className="text-xs text-slate-500">
            {entries === null ? '…' : de ? `${live.length} Teilnehmer · Gesamtgewicht ${fmt(total)}` : `${live.length} entries · total weight ${fmt(total)}`}
          </p>
          {winner && (
            <div className="w-full rounded-xl border border-gold bg-gold/10 px-4 py-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-light">{de ? 'Gewinner' : 'Winner'}</p>
              <p className="font-display text-3xl font-bold text-white">{cleanDisplayName(winner.entry.name)}</p>
              <p className="text-xs text-slate-400">
                {de ? 'Chance' : 'Odds'} {fmt(winner.chance)}% · {de ? 'Gewicht' : 'weight'} {fmt(winner.entry.weight)}
              </p>
              {isAdmin && (
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    type="button"
                    className="btn-accent !px-4 !py-1.5 text-sm"
                    onClick={() => {
                      setRemoved((s) => new Set(s).add(winner.entry.id))
                      setWinner(null)
                    }}
                  >
                    {de ? 'Vom Rad nehmen' : 'Remove from wheel'}
                  </button>
                  <button type="button" className="btn-ghost !px-4 !py-1.5 text-sm" onClick={() => setWinner(null)}>
                    {de ? 'Drin lassen' : 'Keep'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {entries === null ? (
            <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-6 text-center text-sm text-slate-500">…</p>
          ) : live.length === 0 ? (
            <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-6 text-center text-sm text-slate-500">
              {de ? 'Noch niemand im Rad. Die ersten Team-Spiele mit anderen CYN-Mitgliedern tragen euch hier ein.' : 'Nobody on the wheel yet. The first team games with other CYN members put you here.'}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-base-700">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2.5 text-left font-semibold">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Name</th>
                      <th className="px-3 py-2.5 text-right font-semibold">{de ? 'Spiele' : 'Games'}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Win Score</th>
                      <th className="px-3 py-2.5 text-right font-semibold">{de ? 'Basis' : 'Base'}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">{de ? 'Gewicht' : 'Weight'}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">{de ? 'Chance' : 'Chance'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => (
                      <tr key={e.id} className="border-b border-base-700/50 last:border-0">
                        <td className="px-3 py-2 text-slate-500">
                          <span className="mr-2 inline-block h-3 w-3 rounded" style={{ background: colorOf(e.id) }} />
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 font-medium text-white">{cleanDisplayName(e.name)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300" title={`+${fmt(e.gamesFactor)}`}>
                          {e.games} <span className="text-xs text-slate-500">+{fmt(e.gamesFactor)}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300" title={`+${e.winScoreFactor}`}>
                          {fmt(e.winScore)} <span className="text-xs text-slate-500">+{e.winScoreFactor}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(e.base)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-white">{fmt(e.weight)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-accent-light">{fmt((e.weight / total) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {live.length > TOP_ROWS && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost text-sm">
                {showAll ? (de ? 'Nur die Top 10' : 'Show only the top 10') : de ? `Alle ${live.length} anzeigen` : `Show all ${live.length}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

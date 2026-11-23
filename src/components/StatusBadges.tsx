import { useRef, useState, type ReactNode } from 'react'
import { useSharedRoster } from '../lib/access'
import { useLanguage } from '../i18n/LanguageContext'
import { inactiveDays, lastGames, sinceText, useLiveStreams, INACTIVE_DAYS } from '../lib/memberStatus'
import type { MemberStats } from '../lib/stats'

let gamesFor: MemberStats[] | null = null
let games = new Map<string, string | null>()
function lastGameOf(members: MemberStats[], id: string): string | null {
  if (gamesFor !== members) {
    gamesFor = members
    games = lastGames(members)
  }
  return games.get(id) ?? null
}

/** A small badge with an info box on hover (drawn with fixed position, so a table's scroll area does not clip it). */
function Badge({ className, tip, href, children }: { className: string; tip: ReactNode; href?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 268)), y: r.bottom + 6 })
  }
  const hide = () => setPos(null)
  const common = { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, className: `inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide ${className}` }
  return (
    <>
      {href ? (
        <a ref={ref as React.RefObject<HTMLAnchorElement>} href={href} target="_blank" rel="noopener noreferrer" {...common}>
          {children}
        </a>
      ) : (
        <span ref={ref as React.RefObject<HTMLSpanElement>} tabIndex={0} {...common}>
          {children}
        </span>
      )}
      {pos && (
        <div className="pointer-events-none fixed z-[200] w-64 rounded-lg border border-base-600 bg-base-900 p-2.5 text-left text-xs font-normal normal-case tracking-normal text-slate-300 shadow-xl" style={{ left: pos.x, top: pos.y }}>
          {tip}
        </div>
      )}
    </>
  )
}

/**
 * The badges next to a member's name: LIVE on Twitch (purple) and on YouTube (red), each a link to the stream, and INACTIVE (orange) when the
 * member has not played a game with the clan tag for more than 10 days. Hover for the details. Renders nothing for most members.
 */
export default function StatusBadges({ id }: { id: string }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const live = useLiveStreams()
  const roster = useSharedRoster()
  const tw = live?.twitch[id]
  const yt = live?.youtube[id]
  const last = roster ? lastGameOf(roster.members, id) : null
  const idle = inactiveDays(last)
  if (!tw && !yt && idle == null) return null
  const since = (s: string | null | undefined) => (sinceText(s) ? (de ? `seit ${sinceText(s)}` : `for ${sinceText(s)}`) : '')
  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle">
      {tw && (
        <Badge
          className="bg-purple-600 text-white hover:bg-purple-500"
          href={`https://www.twitch.tv/${tw.channel}`}
          tip={
            <>
              <p className="font-semibold text-purple-300">{de ? 'Live auf Twitch' : 'Live on Twitch'}</p>
              {tw.title && <p className="mt-0.5 text-slate-200">{tw.title}</p>}
              <p className="mt-0.5 text-slate-400">
                twitch.tv/{tw.channel} {since(tw.since) && `· ${since(tw.since)}`}
              </p>
              <p className="mt-1 text-slate-500">{de ? 'Klick öffnet den Stream.' : 'Click to open the stream.'}</p>
            </>
          }
        >
          LIVE
        </Badge>
      )}
      {yt && (
        <Badge
          className="bg-red-600 text-white hover:bg-red-500"
          href={`https://www.youtube.com/watch?v=${yt.videoId}`}
          tip={
            <>
              <p className="font-semibold text-red-300">{de ? 'Live auf YouTube' : 'Live on YouTube'}</p>
              {yt.title && <p className="mt-0.5 text-slate-200">{yt.title}</p>}
              <p className="mt-0.5 text-slate-400">
                {yt.channel} {since(yt.since) && `· ${since(yt.since)}`}
              </p>
              <p className="mt-1 text-slate-500">{de ? 'Klick öffnet den Stream.' : 'Click to open the stream.'}</p>
            </>
          }
        >
          LIVE
        </Badge>
      )}
      {idle != null && last && (
        <Badge
          className="bg-orange-500 text-white"
          tip={
            <>
              <p className="font-semibold text-orange-300">{de ? 'Inaktiv' : 'Inactive'}</p>
              <p className="mt-0.5 text-slate-200">
                {de ? `Seit ${idle} Tagen kein Spiel mit dem CYN-Tag.` : `No game with the CYN tag for ${idle} days.`}
              </p>
              <p className="mt-0.5 text-slate-400">
                {de ? 'Zuletzt' : 'Last game'}: {new Date(last).toLocaleDateString(de ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
              <p className="mt-1 text-slate-500">{de ? `Als inaktiv gilt, wer länger als ${INACTIVE_DAYS} Tage nicht mit dem Tag gespielt hat.` : `Inactive means more than ${INACTIVE_DAYS} days without a game with the tag.`}</p>
            </>
          }
        >
          {de ? 'Inaktiv' : 'Inactive'}
        </Badge>
      )}
    </span>
  )
}

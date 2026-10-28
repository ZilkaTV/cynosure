import { Link } from 'react-router-dom'
import CynLogo from './CynLogo'
import { ACCESS_DAYS, GOLD_LEGIONNAIRE_WINS, type Access } from '../lib/access'
import { CLAN_TAG, DISCORD_INVITE } from '../config'
import { useLanguage } from '../i18n/LanguageContext'

const TEXT = {
  de: {
    title: 'Dein Zugriff ist abgelaufen',
    body: (d: number) => `Der Zugriff auf die Seiten gilt ${d} Tage nach deinem letzten Sieg mit dem [${CLAN_TAG}]-Tag. Du hast diese Frist überschritten.`,
    last: (s: string) => `Letzter zählender Sieg: ${s}`,
    never: 'Es wurde noch kein zählender Sieg gefunden.',
    howTitle: 'So bekommst du ihn zurück - ein Sieg mit [CYN]-Tag in:',
    how: ['Ranked 1v1, Ranked 2v2 oder Ranked FFA', 'einem öffentlichen FFA mit mehr als 10 Spielern', 'einem Team-Spiel mit mindestens 2 [CYN]-Mitgliedern'],
    permTitle: 'Dauerhafter Zugriff ohne Frist:',
    perm: ['den Discord-Server boosten', `Gold Legionnaire sein (${GOLD_LEGIONNAIRE_WINS} Siege)`, 'die Seite mit mindestens 5 € unterstützen'],
    donate: 'Seite unterstützen',
    discord: 'Discord',
    updated: 'Die Seite prüft das automatisch - nach einem Sieg dauert es etwas, bis er hier ankommt.',
  },
  en: {
    title: 'Your access has expired',
    body: (d: number) => `Access to the pages lasts ${d} days after your last win with the [${CLAN_TAG}] tag. That time has run out.`,
    last: (s: string) => `Last counting win: ${s}`,
    never: 'No counting win was found yet.',
    howTitle: 'To get it back, win a game with the [CYN] tag in:',
    how: ['Ranked 1v1, Ranked 2v2 or Ranked FFA', 'a public FFA with more than 10 players', 'a team game with at least 2 [CYN] members'],
    permTitle: 'Permanent access without a deadline:',
    perm: ['boost the Discord server', `be a Gold Legionnaire (${GOLD_LEGIONNAIRE_WINS} wins)`, 'support the site with at least 5 EUR'],
    donate: 'Support the site',
    discord: 'Discord',
    updated: 'The site checks this by itself - a win can take a little while to show up here.',
  },
}

/** Shown in place of the pages once the 7-day access has run out. */
export function AccessExpired({ access }: { access: Access }) {
  const { language } = useLanguage()
  const x = language === 'de' ? TEXT.de : TEXT.en
  return (
    <div className="panel mx-auto flex w-full max-w-2xl flex-col items-center bg-grid-fade px-6 py-12 text-center">
      <CynLogo className="h-16 w-16 drop-shadow-[0_0_16px_rgba(139,92,246,0.4)]" />
      <h1 className="mt-4 font-display text-2xl font-bold text-white">{x.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-slate-400">{x.body(ACCESS_DAYS)}</p>
      <p className="mt-1 text-sm text-slate-500">{access.lastWinAt ? x.last(new Date(access.lastWinAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-GB')) : x.never}</p>
      <div className="mt-6 grid w-full gap-4 text-left sm:grid-cols-2">
        <div className="rounded-xl border border-base-600 bg-base-850/60 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gold">{x.howTitle}</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
            {x.how.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-base-600 bg-base-850/60 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gold">{x.permTitle}</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
            {x.perm.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/donate" className="btn-accent">
          {x.donate}
        </Link>
        <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className="btn-ghost">
          {x.discord}
        </a>
      </div>
      <p className="mt-4 text-xs text-slate-500">{x.updated}</p>
    </div>
  )
}

import { useLanguage } from '../i18n/LanguageContext'
import { ffaChange, fmtFfaDelta } from '../lib/gameRows'
import type { PlayerGame } from '../lib/openfront'

// The FFA rating a single game gave (or took), like on OpenFront's own game list: "+11" / "-18" with the expected win chance. OpenFront's game
// list carries it for every rated FFA game (ffaRating: before, after, expected, deltaResult, deltaPlace).

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** A table cell (same look as the Elo cell) with the rating change of one FFA game. */
export function FfaRatingCell({ game }: { game: PlayerGame }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const c = ffaChange(game)
  if (!c) return <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-600">-</td>
  const lines = [
    `FFA Rating: ${Math.round(c.before)} → ${Math.round(c.after)}`,
    c.result != null && c.place != null ? `${de ? 'Ergebnis' : 'Result'} ${fmtFfaDelta(c.result)} · ${de ? 'Platzierung' : 'Placement'} ${fmtFfaDelta(c.place)}` : null,
    c.expected != null ? `${de ? 'Erwartete Siegchance' : 'Expected win'}: ${fmt1(c.expected * 100)} %` : null,
  ].filter(Boolean)
  return (
    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${c.d >= 0 ? 'text-signal-green' : 'text-signal-red'}`} title={lines.join('\n')}>
      {fmtFfaDelta(c.d)}
      {c.expected != null && <span className="ml-1.5 text-[11px] font-normal text-slate-500">{Math.round(c.expected * 100)} %</span>}
    </td>
  )
}

/** How the change comes about (measured from the rated FFA games of the clan members; the formula itself is not published). */
export function FfaRatingInfo() {
  const { language } = useLanguage()
  const de = language === 'de'
  return (
    <details className="panel p-4 text-sm text-slate-300">
      <summary className="cursor-pointer font-semibold text-white">{de ? 'Wie entsteht die FFA-Rating-Änderung eines Spiels?' : 'How is the FFA rating change of a game worked out?'}</summary>
      <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-300">
        <p className="text-xs text-slate-500">
          {de
            ? 'Gemessen an etwa 2.000 bewerteten FFA-Spielen unserer Mitglieder (die genaue Formel veröffentlicht OpenFront nicht, das Rating kommt von OFstats).'
            : 'Measured from about 2,000 rated FFA games of our members (the exact formula is not published by OpenFront; the rating comes from OFstats).'}
        </p>
        <p>
          <b className="text-white">1. {de ? 'Änderung = Ergebnis + Platzierung.' : 'Change = result part + placement part.'}</b>{' '}
          {de ? 'Das stimmt bei jedem gemessenen Spiel auf die Kommastelle genau.' : 'This holds exactly in every game measured.'}
        </p>
        <p>
          <b className="text-white">2. {de ? 'Ergebnis = K × (Ausgang − erwartete Siegchance).' : 'Result = K × (outcome − expected win chance).'}</b>{' '}
          {de
            ? 'Ausgang ist 1 bei einem Sieg und sonst 0. Ein Sieg bringt K × (1 − Siegchance): als Außenseiter (z. B. 16 %) viel, bei 50 % nur die Hälfte von K. Ohne Sieg kostet es K × Siegchance: je höher die erwartete Siegchance, desto mehr Punkte weg.'
            : 'The outcome is 1 for a win and 0 otherwise. A win gives K × (1 − win chance): a lot as an underdog (e.g. 16 %), only half of K at 50 %. Without a win it costs K × win chance: the higher the expected chance, the more points are lost.'}
        </p>
        <p>
          <b className="text-white">3. K {de ? 'sinkt mit der Erfahrung.' : 'falls with experience.'}</b>{' '}
          {de
            ? 'Etwa 28 in den ersten Spielen, 21 ab dem 10. Spiel, 16 ab dem 20., 13 ab dem 40. und 9 ab dem 80. bewerteten Spiel. Neue Spieler bewegen sich also schneller, erfahrene langsamer.'
            : 'About 28 in the first games, 21 from the 10th, 16 from the 20th, 13 from the 40th and 9 from the 80th rated game. New players move faster, experienced ones slower.'}
        </p>
        <p>
          <b className="text-white">4. {de ? 'Platzierung:' : 'Placement:'}</b>{' '}
          {de
            ? 'Bei einem Sieg immer 0. Ohne Sieg meist klein (unter ±1); seltener gibt es große Werte (bis etwa +79 oder −28 gemessen), vermutlich wenn die Platzierung stark von der Erwartung abweicht.'
            : 'Always 0 for a win. Without a win usually small (under ±1); rarely large values occur (up to about +79 or −28 measured), presumably when the placement is far from what was expected.'}
        </p>
        <p className="text-xs text-slate-400">
          {de
            ? 'Beispiele: Sieg bei 50 % Siegchance und K ≈ 22 gibt etwa +11. Niederlage bei 73 % Siegchance und K ≈ 25 gibt etwa −18.'
            : 'Examples: a win at 50 % win chance and K ≈ 22 gives about +11. A defeat at 73 % win chance and K ≈ 25 gives about −18.'}
        </p>
      </div>
    </details>
  )
}

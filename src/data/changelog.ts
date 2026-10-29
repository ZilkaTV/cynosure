// What changed on the site, newest entry first. The "what's new" window (src/components/WhatsNew.tsx) shows the first entry once per
// browser after it was released, on the real site only (never on the dev copy). It is a few short slides, not a text: one big picture,
// a headline of a few words and one sentence per slide, then a row of small chips for everything else. Add an entry with the release.
// An empty list shows nothing. Preview an entry any time with ?whatsnew=1 on the address (also on the dev site).

export type Localized = { de: string; en: string }

/** The picture of a slide: a small mock-up of the feature, drawn in WhatsNew.tsx. */
export type SlideVisual = 'strip' | 'report' | 'colors' | 'event'

export interface ChangelogSlide {
  visual: SlideVisual
  /** Tag in the corner of the picture. */
  tag: Localized
  title: Localized
  text: Localized
  /** Optional button to the page of the feature. */
  link?: { to: string; label: Localized }
}

export interface ChangelogEntry {
  id: string
  date: string
  /** One line on top: what the update is about. */
  tldr: Localized
  slides: ChangelogSlide[]
  /** The rest, as short chips. `important` chips are highlighted. */
  more: { text: Localized; important?: boolean }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-11-01',
    date: '2026-11-01',
    tldr: {
      de: 'Reagieren, kommentieren, neuer Spielbericht und ein Skin-Event.',
      en: 'React, comment, a new game report and a skin event.',
    },
    slides: [
      {
        visual: 'strip',
        tag: { de: 'Neu', en: 'New' },
        title: { de: 'Reagieren, kommentieren, teilen', en: 'React, comment, share' },
        text: { de: 'Unter jedem Spiel: Likes, Kommentare mit Antworten, Speichern und Teilen.', en: 'Under every game: likes, comments with replies, save and share.' },
        link: { to: '/history', label: { de: 'Zum Spielverlauf', en: 'To the game history' } },
      },
      {
        visual: 'report',
        tag: { de: 'Neu', en: 'New' },
        title: { de: 'Der neue Spielbericht', en: 'The new game report' },
        text: { de: 'Teams als Plätze, die Clan-Punkte aller Clans daneben, die Kommentare darunter.', en: 'Teams as places, the clan scores of all clans beside it, the comments below.' },
      },
      {
        visual: 'colors',
        tag: { de: 'Look', en: 'Look' },
        title: { de: 'Dein Name leuchtet', en: 'Your name shines' },
        text: { de: 'Mit Discord-Win-Rolle bekommt dein Name einen Farbverlauf. Siegquoten sind jetzt farbig.', en: 'With a Discord wins role your name gets a colour gradient. Win rates are coloured now.' },
      },
      {
        visual: 'event',
        tag: { de: '1. Nov bis 31. Dez', en: '1 Nov to 31 Dec' },
        title: { de: 'CYN Hero Skin Event', en: 'CYN Hero Skin Event' },
        text: { de: 'Spiele Team-Games mit anderen CYN-Membern und gewinne einen Skin, den es nur 3x gibt.', en: 'Play team games with other CYN members and win a skin that exists only 3 times.' },
        link: { to: '/events', label: { de: 'Zum Event', en: 'To the event' } },
      },
    ],
    more: [
      { text: { de: 'Zugang: 7 Tage ohne Sieg mit [CYN]-Tag sperren die Seite', en: 'Access: 7 days without a win with the [CYN] tag lock the site' }, important: true },
      { text: { de: 'Suche oben links', en: 'Search top left' } },
      { text: { de: 'Rolle und Titel unter deinem Namen', en: 'Role and title under your name' } },
      { text: { de: 'Ranked in Gold mit Elo', en: 'Ranked in gold with Elo' } },
      { text: { de: 'Punkte-Planer in Monatlich Team', en: 'Points planner in Monthly Team' } },
      { text: { de: 'Grinder, Predator, Pro Player', en: 'Grinder, Predator, Pro Player' } },
      { text: { de: 'Listen mit Top 10', en: 'Lists with a top 10' } },
      { text: { de: 'Queue: Alarm für Ranked FFA', en: 'Queue: alert for ranked FFA' } },
      { text: { de: 'Speedrun: Tempo-Check', en: 'Speedrun: speed check' } },
      { text: { de: 'Weg: Bump, Trends, Planer-Seite', en: 'Gone: bump, trends, planner page' } },
    ],
  },
]

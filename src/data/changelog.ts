// What changed on the site, newest entry first. The "what's new" window (src/components/WhatsNew.tsx) shows the first entry once per
// browser after it was released, on the real site only (never on the dev copy). It is a few short slides, not a text: one big picture,
// a headline of a few words and one sentence per slide, then a row of small chips for everything else. Add an entry with the release.
// An empty list shows nothing. Preview an entry any time with ?whatsnew=1 on the address (also on the dev site).

export type Localized = { de: string; en: string }

/** The picture of a slide: a small mock-up of the feature, drawn in WhatsNew.tsx. */
export type SlideVisual = 'site' | 'profile' | 'strip' | 'report' | 'colors' | 'donors' | 'event'

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
      de: 'Die Webseite ist deutlich moderner und übersichtlicher geworden.',
      en: 'The website is much more modern and clearer.',
    },
    slides: [
      {
        visual: 'site',
        tag: { de: 'Neu', en: 'New' },
        title: { de: 'Modern und übersichtlich', en: 'Modern and clear' },
        text: { de: 'Neues Menü, Profil-Suchleiste, einheitliche Buttons und klare Farben auf jeder Seite.', en: 'New menu, profile search bar, matching buttons and clear colours on every page.' },
      },
      {
        visual: 'profile',
        tag: { de: 'Neu', en: 'New' },
        title: { de: 'Dein eigenes Profil', en: 'Your own profile' },
        text: { de: 'Icon und Banner (auch GIFs), Über-mich, Likes, Pinnwand, YouTube und Twitch. Der Rahmen zeigt deine Win-Rolle.', en: 'Icon and banner (GIFs too), about me, likes, a wall, YouTube and Twitch. The frame shows your wins role.' },
      },
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
        text: { de: 'Mit Win-Rolle bekommt dein Name einen Farbverlauf: ab Silber mit Glanz, ab Diamant mit Blitzen. Siegquoten sind farbig.', en: 'With a wins role your name gets a colour gradient: shimmer from silver, lightning from diamond. Win rates are coloured.' },
      },
      {
        visual: 'donors',
        tag: { de: 'Neu', en: 'New' },
        title: { de: 'Spenden und Quests', en: 'Donations and quests' },
        text: { de: 'Caps und Plutonium der Spender, tägliche, wöchentliche und monatliche Spenden-Quests und das Badge Clan Spender. Die Glocke meldet Neues.', en: 'Caps and plutonium of the donors, daily, weekly and monthly donation quests and the Clan Donor badge. The bell tells you what is new.' },
        link: { to: '/clan#spenden', label: { de: 'Zu den Spenden', en: 'To the donations' } },
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
      { text: { de: 'Benachrichtigungen mit Glocke, Zahl im Tab und Ton', en: 'Notification bell with a number in the tab and a sound' } },
      { text: { de: 'Spielerkarte zum Speichern (Account-Menü: Meine Karte)', en: 'Player card to save (account menu: My card)' } },
      { text: { de: 'Booster und Sammlung: jeden Tag ein Gratis-Booster mit 3 Karten', en: 'Boosters and collection: a free booster with 3 cards every day' } },
      { text: { de: 'Profil melden', en: 'Report a profile' } },
      { text: { de: 'Namen führen zum Profil', en: 'Names lead to the profile' } },
      { text: { de: 'Speedruns: CYN-Tag in der Start-Zeit nötig', en: 'Speedruns: CYN tag needed in the start window' } },
      { text: { de: 'Profil-Suchleiste', en: 'Profile search bar' } },
      { text: { de: 'Rolle und Titel unter deinem Namen', en: 'Role and title under your name' } },
      { text: { de: 'Ranked in Gold mit Elo', en: 'Ranked in gold with Elo' } },
      { text: { de: 'Punkte-Planer in Monatlich Team', en: 'Points planner in Monthly Team' } },
      { text: { de: 'Listen mit Top 10', en: 'Lists with a top 10' } },
      { text: { de: 'Queue: Alarm für Ranked FFA', en: 'Queue: alert for ranked FFA' } },
      { text: { de: 'Speedrun: Tempo-Check', en: 'Speedrun: speed check' } },
    ],
  },
]

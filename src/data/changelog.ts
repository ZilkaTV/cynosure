// What changed on the site, newest entry first. The "what's new" window (src/components/WhatsNew.tsx) shows the first entry once
// per browser after it was released, on the real site only (never on the dev copy). Add an entry together with the release:
//
//   {
//     id: '2026-11-05', // changes with every entry; a visitor who has not seen this id sees the window
//     date: '2026-11-05',
//     en: { title: 'What is new', items: ['First change', 'Second change'] },
//     de: { title: 'Das ist neu', items: ['Erste Änderung', 'Zweite Änderung'] },
//   },
//
// An empty list shows nothing. Preview an entry any time with ?whatsnew=1 on the address (also on the dev site).

export interface ChangelogText {
  title: string
  items: string[]
}

export interface ChangelogEntry {
  id: string
  date: string
  en: ChangelogText
  de: ChangelogText
  /** Optional pictures shown above the list (files in public/whatsnew/). */
  images?: { url: string; alt: string }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-11-01',
    date: '2026-11-01',
    de: {
      title: 'Das ist neu auf CynClan',
      items: [
        'Unter jedem Spiel: Gefällt mir mit Reaktionen, Kommentare mit Antworten, Speichern und Teilen. Ein Klick auf die Zahl bei den Reaktionen zeigt, wer was gedrückt hat.',
        'Neuer Spielbericht: sortiert nach Max-Tiles, Teams als Plätze, die Clan-Punkte aller Clans daneben und die Kommentare darunter.',
        'Spielerfarben: Wer eine Discord-Win-Rolle hat, bekommt einen Namen mit Farbverlauf. Siegquoten sind farbig, 0 % blinkt rot, 100 % glänzt golden.',
        'Ranked-Spiele stehen in Gold, mit Elo vor und nach dem Spiel (für Spieler in den Top 100) und dem Hinweis auf Compact-Karten.',
        'Oben links suchst du jedes Mitglied direkt per Name oder ID. Unter deinem Namen stehen deine Rolle und dein Titel.',
        'Monatlich Team hat jetzt den Punkte-Planer und die Decay-Prognose. Monatlich FFA hat Grinder, Predator und Pro Player zurück.',
        'Alle Listen zeigen die ersten 10 Einträge, den Rest holst du dir mit einem Klick.',
        'Live Ranked Queue: Ampel sowie die letzten 5 und 15 Minuten, dazu eine Benachrichtigung für Ranked FFA.',
        'Neues Event: das CYN Hero Skin Event vom 1. November bis 31. Dezember. Alle Details und das Factor Wheel findest du unter Events.',
        'Neue Regel: Der Zugang bleibt 7 Tage nach deinem letzten Sieg mit dem [CYN]-Tag. Dauerhaft haben ihn Server-Booster, Gold Legionnaire und Unterstützer.',
        'Speedruns: Spiele mit schnellerer oder langsamerer Geschwindigkeit werden abgelehnt.',
        'Weg sind der Discord-Bump, die Trends-Seite und die Planer-Seite.',
      ],
    },
    en: {
      title: 'What is new on CynClan',
      items: [
        'Under every game: like with reactions, comments with replies, save and share. Click the number next to the reactions to see who reacted with what.',
        'New game report: sorted by max tiles, teams as places, the clan scores of all clans beside it and the comments below.',
        'Player colours: everybody with a Discord wins role gets a name with a colour gradient. Win rates are coloured, 0 % flashes red, 100 % shines gold.',
        'Ranked games are shown in gold, with the Elo before and after the game (for players in the top 100) and a note for compact maps.',
        'Top left you find any member by name or ID. Your role and your title sit under your name.',
        'Monthly Team now has the points planner and the decay forecast. Monthly FFA has Grinder, Predator and Pro Player back.',
        'All lists show the first 10 entries, the rest is one click away.',
        'Live Ranked Queue: traffic light plus the last 5 and 15 minutes, and a notification for ranked FFA.',
        'New event: the CYN Hero Skin Event from 1 November to 31 December. Everything about it and the Factor Wheel is under Events.',
        'New rule: access stays for 7 days after your last win with the [CYN] tag. Server boosters, Gold Legionnaires and supporters keep it for good.',
        'Speedruns: games played faster or slower than normal speed are refused.',
        'Gone are the Discord bump, the Trends page and the Planner page.',
      ],
    },
  },
]

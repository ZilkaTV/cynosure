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
}

export const CHANGELOG: ChangelogEntry[] = []

# [CYN] Cynosure — OpenFront clan site

A standalone site for the **Cynosure** OpenFront.io clan: live roster, activity
and FFA / Team / 1v1-ranked stats, tracked straight from the OpenFront public
API. **Only games played with the `[CYN]` tag are counted.**

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## How the data works (no server required)

Everything on the stats pages is fetched in the browser from the OpenFront
public API and cached for 1 hour (their rate limits are strict, and elo only
updates hourly):

| Stat                | Source                                                        |
| ------------------- | ------------------------------------------------------------ |
| **1v1 Elo / peak**  | `GET /leaderboard/ranked` — filtered to `clanTag === "CYN"`  |
| **1v1 Ranked Wins** | same ranked ladder (authoritative win count)                 |
| **FFA / Team / All Wins** | `GET /public/player/:id/games` — filtered to CYN-tag games |
| **Monthly wins**    | the same game history, bucketed by month                     |
| **Monthly Elo Δ**   | OpenFront has no elo history, so the site snapshots each member's elo the first time it sees them in a month and reports the change since |
| **Clan ledger**     | `GET /public/clans/leaderboard`                              |

Ranked CYN players are **discovered automatically** from the ladder. Members who
don't play ranked won't appear there — add their OpenFront public ids to
`EXTRA_MEMBER_IDS` in `src/config.ts` so their FFA/Team wins still show.

## Configuration — `src/config.ts`

- `CLAN_TAG`, `CLAN_NAME`
- `DISCORD_INVITE`, `DISCORD_GUILD_ID`
- `EXTRA_MEMBER_IDS` — non-ranked members to include
- `LEADERBOARD_SCAN_PAGES`, `CACHE_TTL_MS`

## The Discord widget

The left-hand widget reads Discord's `widget.json`. It shows live voice channels
and who's connected, plus a **Join Server** button. It stays empty until you turn
the widget on in Discord: **Server Settings → Widget → “Enable Server Widget”.**

## Logo

Drop your crest at `public/logo.png` and it's used everywhere automatically.
Until then a built-in SVG rendition of the shield is shown.

## Registration (optional backend)

The site gates the stats behind a quick registration (in-game name, timezone,
OpenFront public id). Out of the box this is stored in the visitor's browser, so
everything works immediately.

To make registrations **shared** and add real Discord verification:

1. Create a free [Supabase](https://supabase.com) project.
2. Run `supabase/schema.sql` in its SQL editor.
3. (Recommended) Enable the **Discord** auth provider.
4. Copy `.env.example` → `.env.local` and fill in `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY`.

## Deploy

Any static host works. `vercel.json` is included for SPA routing on Vercel —
`npm run build` and deploy `dist/`.

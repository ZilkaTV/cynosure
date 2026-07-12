// ── Cynosure site configuration ─────────────────────────────────────────────
// Everything the site needs to know about the clan lives here.

/** The in-game clan tag. Only games where a player used this tag are counted. */
export const CLAN_TAG = 'CYN'

export const CLAN_NAME = 'Cynosure'

/** Discord invite (the "Join Server" button + the register CTA use this). */
export const DISCORD_INVITE = 'https://discord.gg/whSUb9WwrC'

/**
 * Discord guild id (resolved from the invite above). Used by the live widget.
 * The widget only returns data once you enable it in Discord:
 *   Server Settings → Widget → "Enable Server Widget".
 */
export const DISCORD_GUILD_ID = '1367283444823883776'

/**
 * Members who do NOT appear on the 1v1 ranked leaderboard (e.g. team/FFA-only
 * players) won't be auto-discovered. Add their OpenFront public ids here so
 * their FFA / Team / All wins still show up in the roster. Ranked players are
 * discovered automatically from the leaderboard, so you don't need to list them.
 *
 * Example: ['HabCsQYR', 'oCOTVIG9']
 */
export const EXTRA_MEMBER_IDS: string[] = []

/**
 * How many ranked-leaderboard pages (50 players each) to scan when discovering
 * CYN members. All current CYN 1v1 players sit inside the top ~100, so 3 pages
 * is plenty. Kept low on purpose — the OpenFront API rate-limits are strict.
 */
export const LEADERBOARD_SCAN_PAGES = 3

/** How long fetched OpenFront data is cached in the browser (ms). */
export const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour (OpenFront elo updates hourly)

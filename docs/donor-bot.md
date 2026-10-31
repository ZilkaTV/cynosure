# CYN bot (reads the clan donations by itself)

`worker/donorBot.js` logs in as an OpenFront account that is a member of the clan and reads the donor rankings and the newest donations, like the
userscript does. It runs in the Worker's cron (every 30 minutes, minute :00 and :30, real site only - the dev copy has no cron) and does nothing
until the secret `OPENFRONT_BOT_COOKIE` exists.

## Setting it up (once)

1. Make an OpenFront account for the bot (Discord, Google or e-mail) and let it join the clan CYN.
2. Use a browser profile (or a private window) only for this. Log in at openfront.io with the bot account.
3. F12 -> Network, reload the page, filter for `refresh`, click the `POST .../auth/refresh` request -> Request Headers -> copy the whole value of
   `Cookie:` (`name=value; ...`).
4. **Do not log out** of the bot account afterwards (that revokes the cookie); just close the profile and do not open it again.
5. Put it in the Worker as a secret (it is never shown again and never in the repository):
   `npx wrangler secret put OPENFRONT_BOT_COOKIE` (real site) - paste the value.
6. Clan page -> "Automatisch aktualisieren" panel (admins and inner circle): the line "CYN-Bot" shows the state, "Jetzt testen" runs it once.

## What can go wrong

- `cookie_expired`: OpenFront no longer accepts the cookie. Repeat steps 2-5. If this happens often the lifetime is short and the bot needs another way.
- `not_in_clan`: the bot account is not (yet) a member of CYN.
- A renewed cookie that OpenFront hands out is stored in the hot database (`blobs`, key `donor-bot-cookie`) and used from then on; a new secret starts over.
- Free plan limits: at most 17 OpenFront requests per run (one login, up to 2 pages x 6 rankings, up to 4 pages of single donations).

## Members and games

The same run also reads the clan's member list (`GET /clans/CYN/members`) and the clan's games (`GET /clans/CYN/games`, newest 3 pages per run) and stores them in the
hot database (`blobs`: `clan-members`, `clan-games`). The member document keeps a log of who joined, left or changed the role (newest 100); a list that is
more than 30 % shorter than the last one is refused (`members_incomplete`) so a failed read does not look like half the clan leaving. The games are merged
over the runs (newest 300). Shown on the Clan page below the donations (`ClanTracker.tsx`); `GET /api/clan-donors/members|games` for members of the site.

The bot has its own cron (`5,35 * * * *` in wrangler.jsonc, minute 5 and 35) so that it has its own limit of requests and does not take part of the budget of
the other jobs. The status line shows the first part that failed; `parts` and `shape` (the field names OpenFront sent) are in the status document.

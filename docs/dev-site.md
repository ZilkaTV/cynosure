# Dev site (staging)

Everything new goes to the dev site first, is tried there with a copy of the real data, and only then goes live.

| | real site | dev site |
|---|---|---|
| Address | https://cynclan.com | https://dev.cynclan.com (also https://cynosure-dev.xa9087dwbu5631opu09x357q2.workers.dev) |
| Worker | `cynosure` | `cynosure-dev` (`wrangler.jsonc` -> `env.dev`) |
| Databases | `cynosure`, `cynosure-hot` | `cynosure-dev`, `cynosure-hot-dev` (copies, own data) |
| Screenshots | `cynosure-screenshots` | `cynosure-screenshots-dev` |
| Access | public | password (secret `DEV_PASSWORD`), without it the site answers 503 |
| Sign-in | Discord | test sign-in by OpenFront id (orange bar at the top), no Discord |
| Cron / workflows | every 10 minutes | none, the dev Worker cannot start the real workflows |

## One-time setup (secrets, done by the owner)
```bash
npx wrangler secret put DEV_PASSWORD --env dev
npx wrangler secret put SESSION_SECRET --env dev
```
`DEV_PASSWORD`: the password for the browser prompt (any user name). `SESSION_SECRET`: any long random string (at least 32 characters),
signs the test sign-in. Nothing else is needed.

## Everyday use
```bash
git checkout next-week        # or any branch with the new work
npm run deploy:dev            # build + deploy to the dev site
npm run sync:dev              # refresh the dev data from the real data (reads the real databases, writes only the dev ones)
```
Open https://dev.cynclan.com, enter the password, type an OpenFront id into the orange bar ("Test-Login") to be that member.
The real site is only deployed from `master` (`npx wrangler deploy` without `--env`), after the dev site looked right.

## What is not on the dev site
- Discord sign-in (its redirect address is the real site's) - use the test sign-in.
- The scheduled jobs (ranked feed, refresh-details, ledger ...): they write the real databases. The dev data is a snapshot from the last `sync:dev`.
- Private tables (help chat, survey answers, visit log) are not copied.
- Features that need the cloud (speedrun check in `verify-speedruns.yml`) run against the real databases; try them on the real site or point
  a copy of the workflow at the dev Worker.

## Mind the daily write limit
The free D1 plan allows 100,000 rows written per day for the **whole account** (real and dev databases together; a row with indexes counts
several times). A full copy into the dev databases used the day up once, and the real site could not write until midnight UTC.
`npm run sync:dev` therefore copies the light set by default (no queue history, snapshots, tile stats, ledger); `DEV_SYNC_FULL=1` copies
everything - run that only in the morning (UTC) after checking the day's write count.

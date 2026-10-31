# Profile pages like Steam (branch `profiles`, not part of the 1 November release)

What a Steam profile has, and what we took over: a **banner** and a big **icon** (avatar) on its edge, the name with a **level badge**, a short **about me**, a
**like** for the profile, a **comment wall**. Showcases, friends and groups have no meaning here (the badge board, the career/lifetime windows and the game list are our showcases).

## What members can do
- Own profile -> "Profil bearbeiten": upload an **icon** (max 2 MB) and a **banner** (max 5 MB), PNG / JPG / WebP / **GIF** (animated ones stay animated), write the about-me text (300 characters), take pictures away again.
- Any member: like a profile (one like each, not the own one; the tooltip names who), write on the wall (500 characters, 3 in 30 seconds, blocked-language filter like the chat), delete own comments.
- Owner of a profile: deletes any comment on their wall. Admins: delete any comment, take an icon / banner / about-me text away from any profile (buttons under the header).

## How it is built
- `worker/d1/006-profiles.sql`: columns `cyn_members.avatar_url / banner_url / bio`, tables `cyn_profile_likes`, `cyn_profile_comments`. **Run it once on the real database before this branch goes live** (the dev database has it).
- Pictures: `POST /api/profile-media?kind=avatar|banner` (`worker/profileMedia.js`). The file type comes from the file's own bytes (never from its name), stored in the R2 bucket of the screenshots under
  `profiles/<id>-<kind>-<time>.<ext>`, served by `/api/screenshots/...` (nosniff, same origin, so the CSP needs no change). The address is written by this Worker only: the data API strips
  `avatar_url` / `banner_url` from every request, so a profile can never point at a picture somewhere else. The old file is deleted when a new one comes. One upload every 20 seconds per member.
  `DELETE /api/profile-media?kind=avatar|banner|bio[&member=id]`: own, or any by an admin.
- The access rules for likes, comments and the about-me text are in `worker/dbApi.js`; `scripts/test-db-api.mjs` checks them and the upload endpoint (needs the local R2 and hot database of `wrangler dev --local`).
- Page: `ProfileHeader.tsx` (banner, icon, level, like, edit panel, admin tools), `ProfileWall.tsx`, `src/lib/profileExtras.ts`.

## Not done yet (ideas)
- Show the icon next to names in tables, the account menu, the profile search and comments of games.
- A "report" button for pictures; a picture check before it is shown (nothing is checked automatically, admins remove).

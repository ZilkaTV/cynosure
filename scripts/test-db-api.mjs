// Access-rule tests for the data API (worker/dbApi.js) against a LOCAL Worker + local D1. Not run in CI.
//   npx wrangler d1 execute cynosure --local --file worker/d1/users-schema.sql
//   npx wrangler dev --local --port 8799 --host 127.0.0.1:8799 --var SESSION_SECRET:localtestsecretlocaltestsecret1234567 --var HOT_API_SECRET:localhotsecretlocalhotsecret123456
//   node scripts/test-db-api.mjs      (re-run on a fresh local DB: delete .wrangler/state first)
import crypto from 'node:crypto'
const BASE = 'http://localhost:8799'
const SECRET = 'localtestsecretlocaltestsecret1234567'
const HOT = 'localhotsecretlocalhotsecret123456'

function cookie(id, name) {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ sub: id, name, global: null, avatar: null, iat: now, exp: now + 3600 })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `cyn_session=${payload}.${sig}`
}
function proof(id, openfrontId, offset = 600) {
  const exp = Math.floor(Date.now() / 1000) + offset
  return `${exp}.${crypto.createHmac('sha256', SECRET).update(`own|${id}|${openfrontId}|${exp}`).digest('base64url')}`
}
const q = async (body, who) => (await fetch(`${BASE}/api/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Cookie: cookie(...who) } : {}) }, body: JSON.stringify(body) })).json()
const svc = async (path, body) => (await fetch(`${BASE}/api/internal/users/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HOT}` }, body: JSON.stringify(body) })).json()

let fails = 0
const check = (label, cond, extra) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + label + (cond ? '' : ' -> ' + JSON.stringify(extra)))
  if (!cond) fails++
}

// seed through the service import
await svc('import?table=cyn_members', [
  { openfront_id: 'AAAA1111', in_game_name: 'Alice', timezone: 'UTC', discord_username: 'alice', user_id: 'd1', discord_user_id: 'd1', claimed: true },
  { openfront_id: 'BBBB2222', in_game_name: 'Bob', timezone: 'UTC', discord_username: 'bob', user_id: null, claimed: false },
])
await svc('import?table=cyn_event_admins', [{ discord_username: 'alice', user_id: 'd1' }])
await svc('import?table=cyn_inner_circle', [{ openfront_id: 'AAAA1111' }])

const A = ['d1', 'alice']
const C = ['d3', 'carol']

let r = await q({ table: 'cyn_members', op: 'select', select: '*', filters: [], order: [] })
check('anon reads members', !r.error && r.data.length >= 2, r)
check('anon never sees user_id', r.data.every((m) => !('user_id' in m) && !('discord_user_id' in m)), r.data[0])
check('claimed is boolean', typeof r.data[0].claimed === 'boolean', r.data[0])

r = await q({ table: 'cyn_members', op: 'select', select: 'openfront_id', filters: [{ col: 'user_id', op: 'eq', val: 'd1' }], order: [] })
check('anon cannot probe the hidden user_id column', r.error?.code === '42703', r)
r = await q({ table: 'cyn_members', op: 'select', select: 'openfront_id', filters: [{ col: 'discord_user_id', op: 'eq', val: 'd1' }], order: [] })
check('anon cannot probe discord_user_id', r.error?.code === '42703', r)

r = await q({ table: 'cyn_game_nights', op: 'select', select: '*', filters: [], order: [] })
check('anon cannot read game nights', r.error?.code === '42501', r)

r = await q({ table: 'cyn_speedruns', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'g', seconds: 300 }, filters: [], order: [] })
check('anon cannot write speedrun', r.error?.code === '42501', r)

r = await q({ table: 'cyn_speedruns', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'g', seconds: 300 }, filters: [], order: [] }, A)
check('member cannot write a speedrun directly (only the verification job does)', r.error?.code === '42501', r)
r = await q({ table: 'cyn_speedruns', op: 'select', select: '*', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('speedrun table is readable', !r.error && r.data == null, r)

// members: claim + protection
r = await q({ table: 'cyn_members', op: 'upsert', values: { openfront_id: 'BBBB2222', in_game_name: 'Bobby', timezone: 'UTC', user_id: 'evil' }, onConflict: 'openfront_id', filters: [], order: [] }, ['d2', 'bob'])
check('claiming without proof is refused', r.error?.message === 'ownership_required', r)
r = await q({ table: 'cyn_members', op: 'upsert', values: { openfront_id: 'BBBB2222', in_game_name: 'Bobby', timezone: 'UTC', _proof: proof('d9', 'BBBB2222') }, onConflict: 'openfront_id', filters: [], order: [] }, ['d2', 'bob'])
check('proof of another account is refused', r.error?.message === 'ownership_required', r)
r = await q({ table: 'cyn_members', op: 'upsert', values: { openfront_id: 'BBBB2222', in_game_name: 'Bobby', timezone: 'UTC', _proof: proof('d2', 'BBBB2222', -5) }, onConflict: 'openfront_id', filters: [], order: [] }, ['d2', 'bob'])
check('expired proof is refused', r.error?.message === 'ownership_required', r)
r = await q({ table: 'cyn_members', op: 'upsert', values: { openfront_id: 'BBBB2222', in_game_name: 'Bobby', timezone: 'UTC', user_id: 'evil', _proof: proof('d2', 'BBBB2222') }, onConflict: 'openfront_id', filters: [], order: [] }, ['d2', 'bob'])
check('d2 claims unowned row with proof', !r.error, r)
r = await q({ table: 'cyn_members', op: 'upsert', values: { openfront_id: 'BBBB2222', in_game_name: 'Bobby2', timezone: 'UTC' }, onConflict: 'openfront_id', filters: [], order: [] }, ['d2', 'bob'])
check('owner updates own row without proof', !r.error, r)
r = await q({ table: 'cyn_members', op: 'select', select: 'openfront_id, in_game_name, claimed, discord_user_id', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' }, ['d2', 'bob'])
check('claim stored with session identity', r.data?.in_game_name === 'Bobby2' && r.data.claimed === true && r.data.discord_user_id === 'd2', r)
r = await q({ table: 'cyn_members', op: 'select', select: 'discord_username', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('discord username comes from the session, not the request', r.data?.discord_username === 'bob', r)
r = await q({ table: 'cyn_members', op: 'upsert', values: { openfront_id: 'BBBB2222', in_game_name: 'Hacked', timezone: 'UTC' }, onConflict: 'openfront_id', filters: [], order: [] }, C)
check('carol cannot take over a claimed row', r.error?.code === '42501', r)

// game nights (inner circle)
const soon = new Date(Date.now() + 3600e3).toISOString()
r = await q({ table: 'cyn_game_nights', op: 'insert', values: { starts_at: soon, note: 'x', created_by: 'AAAA1111' }, filters: [], order: [] }, A)
check('inner member creates game night', !r.error, r)
r = await q({ table: 'cyn_game_nights', op: 'insert', values: { starts_at: soon, note: 'x', created_by: 'BBBB2222' }, filters: [], order: [] }, ['d2', 'bob'])
check('non-inner cannot create game night', r.error?.code === '42501', r)
r = await q({ table: 'cyn_game_nights', op: 'select', select: 'id, starts_at, note, created_by, created_at', filters: [], order: [{ col: 'starts_at', asc: true }] }, C)
check('signed-in reads game nights', !r.error && r.data.length === 1, r)
const gnId = r.data?.[0]?.id
r = await q({ table: 'cyn_game_night_rsvps', op: 'upsert', values: { game_night_id: gnId, openfront_id: 'AAAA1111', status: 'going', updated_at: new Date().toISOString() }, onConflict: 'game_night_id,openfront_id', filters: [], order: [] }, A)
check('rsvp upsert', !r.error, r)
r = await q({ table: 'cyn_game_nights', op: 'delete', filters: [{ col: 'id', op: 'eq', val: gnId }], order: [] }, ['d2', 'bob'])
const left = await q({ table: 'cyn_game_nights', op: 'select', select: 'id', filters: [], order: [] }, A)
check('other member cannot delete game night', r.error?.code === '42501' && left.data.length === 1, [r, left])

// a plain update must not touch rows nobody owns, nor the id of an owned row
await svc('import?table=cyn_members', [{ openfront_id: 'CCCC3333', in_game_name: 'Free', timezone: 'UTC', discord_username: 'free', user_id: null, claimed: false }])
r = await q({ table: 'cyn_members', op: 'update', values: { in_game_name: 'Vandal' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'CCCC3333' }], order: [] }, C)
check('cannot update a member row nobody claimed', !r.error, r) // no error (zero rows), but nothing changes:
r = await q({ table: 'cyn_members', op: 'select', select: 'in_game_name', filters: [{ col: 'openfront_id', op: 'eq', val: 'CCCC3333' }], order: [], single: 'maybe' })
check('unclaimed row unchanged after a foreign update', r.data?.in_game_name === 'Free', r)
r = await q({ table: 'cyn_members', op: 'update', values: { openfront_id: 'ZZZZ9999', in_game_name: 'Alice2' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'openfront_id, in_game_name', filters: [{ col: 'in_game_name', op: 'eq', val: 'Alice2' }], order: [] })
check('owner can rename but not change the id', r.data?.length === 1 && r.data[0].openfront_id === 'AAAA1111', r)
await q({ table: 'cyn_members', op: 'update', values: { in_game_name: 'Alice' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)

// reactions
r = await q({ table: 'cyn_kudos', op: 'insert', values: [{ game_id: 'G1', from_openfront_id: 'AAAA1111', to_openfront_id: 'BBBB2222', emoji: 'not an emoji' }], filters: [], order: [] }, A)
check('unknown reaction is refused', /invalid_emoji/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_kudos', op: 'insert', values: [{ game_id: 'G1', from_openfront_id: 'AAAA1111', to_openfront_id: 'bad id!', emoji: '❤️' }], filters: [], order: [] }, A)
check('bad member id in a reaction is refused', /invalid_id/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_game_tile_stats', op: 'upsert', values: { game_id: 'G1', vendored_commit: 'c', compute_logic_version: 1, max_tiles: {}, max_percent: {}, final_tiles: {} }, onConflict: 'game_id,vendored_commit,compute_logic_version', filters: [], order: [] })
check('anonymous cannot write tile stats', r.error?.code === '42501', r)
r = await q({ table: 'cyn_kudos', op: 'insert', values: [{ game_id: 'G1', from_openfront_id: 'AAAA1111', to_openfront_id: 'BBBB2222', emoji: '❤️' }], filters: [], order: [] }, A)
check('reaction insert', !r.error, r)
r = await q({ table: 'cyn_kudos', op: 'insert', values: [{ game_id: 'G1', from_openfront_id: 'AAAA1111', to_openfront_id: 'BBBB2222', emoji: '❤️' }], filters: [], order: [] }, A)
check('duplicate reaction -> 23505', r.error?.code === '23505', r)
r = await q({ table: 'cyn_kudos', op: 'insert', values: [{ game_id: 'G1', from_openfront_id: 'BBBB2222', to_openfront_id: 'AAAA1111', emoji: '❤️' }], filters: [], order: [] }, A)
check('cannot react as someone else', r.error?.code === '42501', r)
r = await q({ table: 'cyn_kudos', op: 'select', select: 'game_id, emoji', filters: [{ col: 'game_id', op: 'in', val: Array.from({ length: 150 }, (_, i) => (i === 3 ? 'G1' : 'X' + i)) }], order: [] })
check('long IN list works', !r.error && r.data.length === 1, r)

// chat
r = await q({ table: 'cyn_clan_chat_messages', op: 'insert', values: { author_name: 'Alice', content: '  hello  ' }, filters: [], order: [] }, A)
check('chat post', !r.error, r)
r = await q({ table: 'cyn_clan_chat_messages', op: 'insert', values: { author_name: 'Alice', content: 'again' }, filters: [], order: [] }, A)
check('chat rate limit', /rate_limited/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_chat_message_counts', op: 'select', select: 'openfront_id, count', filters: [], order: [] })
check('chat counter incremented', r.data?.[0]?.count === 1, r)
r = await q({ table: 'cyn_clan_chat_messages', op: 'select', select: '*', filters: [], order: [] }, C)
check('non-member cannot read chat', r.error?.code === '42501', r)
r = await q({ table: 'cyn_clan_chat_messages', op: 'select', select: '*', filters: [], order: [] }, A)
check('member reads chat, content trimmed', r.data?.[0]?.content === 'hello' && r.data[0].author_openfront_id === 'AAAA1111', r)

// admin lists + inner reads
r = await q({ table: 'cyn_supporters', op: 'insert', values: { openfront_id: 'BBBB2222' }, filters: [], order: [] }, C)
check('non-admin cannot add supporter', r.error?.code === '42501', r)
r = await q({ table: 'cyn_supporters', op: 'insert', values: { openfront_id: 'BBBB2222' }, filters: [], order: [] }, A)
check('admin adds supporter', !r.error, r)
r = await q({ table: 'cyn_supporters', op: 'insert', values: { openfront_id: 'BBBB2222' }, filters: [], order: [] }, A)
check('duplicate supporter -> 23505', r.error?.code === '23505', r)
r = await q({ table: 'cyn_site_visits', op: 'insert', values: { is_member: false }, filters: [], order: [] })
check('anon logs a visit', !r.error, r)
r = await q({ table: 'cyn_site_visits', op: 'select', select: 'id', count: true, head: true, filters: [{ col: 'is_member', op: 'eq', val: false }], order: [] }, A)
check('inner circle counts visits', r.count === 1, r)
r = await q({ table: 'cyn_site_visits', op: 'select', select: 'id', count: true, head: true, filters: [], order: [] }, C)
check('others cannot read visits', r.error?.code === '42501', r)

// survey: deadline passed
r = await q({ table: 'cyn_survey_responses', op: 'upsert', values: { in_game_name: 'A', answers: { q: ['x'] } }, onConflict: 'user_id', filters: [], order: [] }, A)
check('survey closed', r.error?.code === '42501', r)
r = await (await fetch(`${BASE}/api/db/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn: 'cyn_survey_nominees' }) })).json()
check('rpc nominees', !r.error && Array.isArray(r.data), r)

// comments: the shown name is the member's own; reactions only with a known emoji on an existing comment
r = await q({ table: 'cyn_game_comments', op: 'insert', values: { game_id: 'G1', author_openfront_id: 'AAAA1111', author_name: 'Somebody Else', body: 'hi' }, filters: [], order: [] }, A)
check('comment insert', !r.error, r)
r = await q({ table: 'cyn_game_comments', op: 'select', select: 'id, author_name', filters: [{ col: 'game_id', op: 'eq', val: 'G1' }], order: [] })
check('comment shows the member name, not the typed one', r.data?.[0]?.author_name === 'Alice', r)
const cid = r.data?.[0]?.id
r = await q({ table: 'cyn_comment_reactions', op: 'insert', values: { comment_id: cid, openfront_id: 'AAAA1111', emoji: '\u{1F525}' }, filters: [], order: [] }, A)
check('comment reaction insert', !r.error, r)
r = await q({ table: 'cyn_comment_reactions', op: 'insert', values: { comment_id: cid, openfront_id: 'AAAA1111', emoji: 'lol' }, filters: [], order: [] }, A)
check('unknown comment reaction refused', /invalid_emoji/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_comment_reactions', op: 'insert', values: { comment_id: 99999, openfront_id: 'AAAA1111', emoji: '\u{1F525}' }, filters: [], order: [] }, A)
check('reaction on a missing comment refused', /invalid_comment/.test(r.error?.message ?? ''), r)

// event submissions forced pending (signed-in visitors only)
r = await q({ table: 'cyn_event_submissions', op: 'insert', values: { event_id: 'e', team_id: 't', submitted_by: 'x', game_link: 'https://a', screenshot_url: 'https://b', category: 'public', points: 1, status: 'accepted' }, filters: [], order: [] })
check('anonymous submission is refused', r.error?.code === '42501', r)
r = await q({ table: 'cyn_event_submissions', op: 'insert', values: { event_id: 'e', team_id: 't', submitted_by: 'x', game_link: 'https://a', screenshot_url: 'https://b', category: 'public', points: 1, status: 'accepted' }, filters: [], order: [] }, A)
check('submission insert (signed in)', !r.error, r)
r = await q({ table: 'cyn_event_submissions', op: 'select', select: '*', filters: [], order: [] })
check('submission forced pending', r.data?.[0]?.status === 'pending', r)

// json column decode
await svc('import?table=cyn_event_teams', [{ id: 't1', event_id: 'e', name: 'T', starting_points: 0, captain: 'x', players: ['a', 'b'] }])
r = await q({ table: 'cyn_event_teams', op: 'select', select: '*', filters: [], order: [] })
check('json column decoded', Array.isArray(r.data?.[0]?.players), r)

// service query
r = await svc('query', { table: 'cyn_members', op: 'select', select: 'openfront_id, user_id', filters: [], order: [] })
check('service sees user_id', r.data?.some((m) => m.user_id === 'd1'), r)

// saved games (upsert needs the update rule too)
r = await q({ table: 'cyn_saved_games', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'G9', title: 'Iceland', saved_at: new Date().toISOString() }, onConflict: 'openfront_id,game_id', filters: [], order: [] }, A)
check('member saves a game', !r.error, r)
r = await q({ table: 'cyn_saved_games', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'G9', title: 'Iceland 2' }, onConflict: 'openfront_id,game_id', filters: [], order: [] }, A)
check('saving again updates', !r.error, r)
r = await q({ table: 'cyn_saved_games', op: 'upsert', values: { openfront_id: 'BBBB2222', game_id: 'G9', title: 'x' }, onConflict: 'openfront_id,game_id', filters: [], order: [] }, A)
check('cannot save for someone else', r.error?.code === '42501', r)
r = await q({ table: 'cyn_saved_games', op: 'select', select: 'game_id, title', filters: [], order: [] }, A)
check('reads only own saved games', r.data?.length === 1 && r.data[0].title === 'Iceland 2', r)
r = await q({ table: 'cyn_saved_games', op: 'delete', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }, { col: 'game_id', op: 'eq', val: 'G9' }], order: [] }, A)
const after = await q({ table: 'cyn_saved_games', op: 'select', select: 'game_id', filters: [], order: [] }, A)
check('member removes a saved game', !r.error && after.data.length === 0, [r, after])

// profile pages: likes, comment wall, about me, pictures (the pictures need R2 and the hot schema: the local Worker has both)
const B = ['d2', 'bob']
r = await q({ table: 'cyn_profile_likes', op: 'insert', values: { profile_id: 'BBBB2222', from_id: 'AAAA1111' }, filters: [], order: [] }, A)
check('profile like', !r.error, r)
r = await q({ table: 'cyn_profile_likes', op: 'insert', values: { profile_id: 'BBBB2222', from_id: 'AAAA1111' }, filters: [], order: [] }, A)
check('profile like twice -> 23505', r.error?.code === '23505', r)
r = await q({ table: 'cyn_profile_likes', op: 'insert', values: { profile_id: 'AAAA1111', from_id: 'AAAA1111' }, filters: [], order: [] }, A)
check('no like for your own profile', /invalid_target/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_profile_likes', op: 'insert', values: { profile_id: 'BBBB2222', from_id: 'AAAA1111' }, filters: [], order: [] }, C)
check('profile like as somebody else is refused', r.error?.code === '42501', r)
r = await q({ table: 'cyn_profile_likes', op: 'insert', values: { profile_id: 'NOPE9999', from_id: 'BBBB2222' }, filters: [], order: [] }, B)
check('like for a profile that does not exist is refused', /invalid_target/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_profile_likes', op: 'select', select: 'from_id', filters: [{ col: 'profile_id', op: 'eq', val: 'BBBB2222' }], order: [] })
check('likes are public', r.data?.length === 1 && r.data[0].from_id === 'AAAA1111', r)

r = await q({ table: 'cyn_profile_comments', op: 'insert', values: { profile_id: 'BBBB2222', author_openfront_id: 'AAAA1111', author_name: 'Somebody Else', body: 'Nice profile' }, filters: [], order: [] }, A)
check('profile comment', !r.error, r)
r = await q({ table: 'cyn_profile_comments', op: 'select', select: 'id, author_name', filters: [{ col: 'profile_id', op: 'eq', val: 'BBBB2222' }], order: [] })
check('profile comment shows the member name', r.data?.[0]?.author_name === 'Alice', r)
const pc = r.data?.[0]?.id
r = await q({ table: 'cyn_profile_comments', op: 'insert', values: { profile_id: 'BBBB2222', author_openfront_id: 'AAAA1111', body: '   ' }, filters: [], order: [] }, A)
check('empty profile comment refused', /invalid_length/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_profile_comments', op: 'insert', values: { profile_id: 'BBBB2222', author_openfront_id: 'AAAA1111', body: 'x'.repeat(501) }, filters: [], order: [] }, A)
check('long profile comment refused', /invalid_length/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_profile_comments', op: 'insert', values: { profile_id: 'BBBB2222', author_openfront_id: 'AAAA1111', body: 'hi' }, filters: [], order: [] }, C)
check('profile comment by a non-member refused', r.error?.code === '42501', r)
r = await q({ table: 'cyn_profile_comments', op: 'delete', filters: [{ col: 'id', op: 'eq', val: pc }], order: [] }, C)
let remaining = await q({ table: 'cyn_profile_comments', op: 'select', select: 'id', filters: [{ col: 'id', op: 'eq', val: pc }], order: [] })
check('a stranger cannot delete a comment', remaining.data?.length === 1, [r, remaining])
r = await q({ table: 'cyn_profile_comments', op: 'delete', filters: [{ col: 'id', op: 'eq', val: pc }], order: [] }, B)
remaining = await q({ table: 'cyn_profile_comments', op: 'select', select: 'id', filters: [{ col: 'id', op: 'eq', val: pc }], order: [] })
check('the profile owner deletes a comment on the wall', remaining.data?.length === 0, [r, remaining])

r = await q({ table: 'cyn_members', op: 'update', values: { bio: '  Hello, I play FFA.  ' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [] }, B)
r = await q({ table: 'cyn_members', op: 'select', select: 'bio', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('about me saved and trimmed', r.data?.bio === 'Hello, I play FFA.', r)
r = await q({ table: 'cyn_members', op: 'update', values: { bio: 'y'.repeat(301) }, filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [] }, B)
check('about me over 300 characters refused', /invalid_length/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_members', op: 'update', values: { bio: 'hacked' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'bio', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('about me of somebody else cannot be changed', r.data?.bio === 'Hello, I play FFA.', r)
r = await q({ table: 'cyn_members', op: 'update', values: { avatar_url: 'https://evil.example/x.png', banner_url: 'https://evil.example/y.gif' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [] }, B)
r = await q({ table: 'cyn_members', op: 'select', select: 'avatar_url, banner_url', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('picture addresses cannot be set through the data API', r.data?.avatar_url == null && r.data?.banner_url == null, r)

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const media = async (method, who, kind, body, extra = '') => {
  const res = await fetch(`${BASE}/api/profile-media?kind=${kind}${extra}`, { method, headers: who ? { Cookie: cookie(...who) } : {}, body })
  return { status: res.status, body: await res.json().catch(() => null) }
}
r = await media('POST', null, 'avatar', PNG)
check('picture upload needs a sign-in', r.status === 401, r)
r = await media('POST', C, 'avatar', PNG)
check('picture upload needs a member', r.status === 403, r)
r = await media('POST', A, 'avatar', Buffer.from('this is not an image'))
check('a text file is not accepted as a picture', r.status === 415, r)
r = await media('POST', B, 'avatar', Buffer.alloc(2 * 1024 * 1024 + 10, 1))
check('an avatar over 2 MB is refused', r.status === 413, r)
r = await media('POST', B, 'banner', GIF)
check('a GIF banner is accepted', r.status === 200 && /^\/api\/screenshots\/profiles\/BBBB2222-banner-\d+\.gif$/.test(r.body?.url ?? ''), r)
const bannerUrl = r.body?.url
let img = await fetch(BASE + bannerUrl)
check('the banner is served with its real type', img.status === 200 && img.headers.get('content-type') === 'image/gif', img.status)
r = await q({ table: 'cyn_members', op: 'update', values: { avatar_fit: '40,60.5,1.5', banner_fit: '10,90,2' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'avatar_fit, banner_fit', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('picture placement is saved', r.data?.avatar_fit === '40,60.5,1.5' && r.data?.banner_fit === '10,90,2', r)
r = await q({ table: 'cyn_members', op: 'update', values: { avatar_fit: '150,10,1' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
check('a placement outside 0-100 percent is refused', /invalid_fit/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_members', op: 'update', values: { banner_fit: '50,50,9' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
check('a zoom above 3 is refused', /invalid_fit/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_members', op: 'update', values: { avatar_fit: 'javascript:alert(1)' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
check('a placement that is not numbers is refused', /invalid_fit/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_members', op: 'update', values: { avatar_fit: '1,1,1' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'avatar_fit', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('the placement of somebody else cannot be changed', r.data?.avatar_fit == null, r)
r = await q({ table: 'cyn_members', op: 'update', values: { yt_channel: '  @Zilka  ', twitch_channel: 'zilka_tv' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'yt_channel, twitch_channel', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('YouTube and Twitch channel are saved', r.data?.yt_channel === '@Zilka' && r.data?.twitch_channel === 'zilka_tv', r)
r = await q({ table: 'cyn_members', op: 'update', values: { yt_channel: 'javascript:alert(1)' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
check('a bad YouTube channel is refused', /invalid_channel/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_members', op: 'update', values: { twitch_channel: 'https://evil.com' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
check('a bad Twitch channel is refused', /invalid_channel/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_members', op: 'update', values: { twitch_channel: 'hackedname' }, filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'twitch_channel', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('the channels of somebody else cannot be changed', r.data?.twitch_channel == null, r)
r = await q({ table: 'cyn_members', op: 'update', values: { yt_channel: '', twitch_channel: null }, filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [] }, A)
r = await q({ table: 'cyn_members', op: 'select', select: 'yt_channel, twitch_channel', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('channels can be removed', r.data?.yt_channel == null && r.data?.twitch_channel == null, r)
r = await media('POST', A, 'avatar', PNG)
check('a PNG avatar is accepted', r.status === 200 && /\.png$/.test(r.body?.url ?? ''), r)
const avatarUrl = r.body?.url
r = await media('POST', A, 'banner', PNG)
check('uploads in quick succession are slowed down', r.status === 429, r)
r = await q({ table: 'cyn_members', op: 'select', select: 'avatar_fit, banner_fit', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('a new avatar starts with a fresh placement, the banner keeps its own', r.data?.avatar_fit == null && r.data?.banner_fit === '10,90,2', r)
r = await q({ table: 'cyn_members', op: 'select', select: '*', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('"*" does not include the profile columns', r.data && !('avatar_url' in r.data) && !('bio' in r.data) && !('banner_fit' in r.data), r)
r = await q({ table: 'cyn_members', op: 'select', select: 'avatar_url', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('the avatar address is stored in the member row', r.data?.avatar_url === avatarUrl, r)
r = await media('DELETE', C, 'banner', undefined, '&member=BBBB2222')
check('a non-member cannot remove a picture', r.status === 403, r)
r = await media('DELETE', B, 'avatar', undefined, '&member=AAAA1111')
check('a member who is no admin cannot remove somebody elses picture', r.status === 403, r)
r = await media('DELETE', A, 'banner', undefined, '&member=BBBB2222')
check('an admin removes somebody elses banner', r.status === 200, r)
img = await fetch(BASE + bannerUrl)
check('the removed banner is gone from the storage', img.status === 404, img.status)
r = await media('DELETE', A, 'avatar')
check('a member removes their own avatar', r.status === 200, r)
r = await media('DELETE', A, 'bio', undefined, '&member=BBBB2222')
r = await q({ table: 'cyn_members', op: 'select', select: 'bio', filters: [{ col: 'openfront_id', op: 'eq', val: 'BBBB2222' }], order: [], single: 'maybe' })
check('an admin clears somebody elses about me', r.data?.bio == null, r)

// reports of profiles and comments
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'BBBB2222', target_type: 'profile', target_id: 'AAAA1111', reason: 'image', note: ' offensive banner ' }, filters: [], order: [] }, B)
check('a member reports a profile', !r.error, r)
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'BBBB2222', target_type: 'profile', target_id: 'AAAA1111', reason: 'spam' }, filters: [], order: [] }, B)
check('the same profile cannot be reported twice while the report is open', /already_reported/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'BBBB2222', target_type: 'profile', target_id: 'BBBB2222', reason: 'spam' }, filters: [], order: [] }, B)
check('no report of your own profile', /invalid_target/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'BBBB2222', target_type: 'profile', target_id: 'CCCC3333', reason: 'because' }, filters: [], order: [] }, B)
check('an unknown reason is refused', /invalid_reason/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'BBBB2222', target_type: 'profile', target_id: 'NOPE9999', reason: 'spam' }, filters: [], order: [] }, B)
check('a report of a profile that does not exist is refused', /invalid_target/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'BBBB2222', target_type: 'comment', target_id: '99999', reason: 'insult' }, filters: [], order: [] }, B)
check('a report of a comment that does not exist is refused', /invalid_target/.test(r.error?.message ?? ''), r)
r = await q({ table: 'cyn_reports', op: 'insert', values: { reporter_openfront_id: 'AAAA1111', target_type: 'profile', target_id: 'BBBB2222', reason: 'spam' }, filters: [], order: [] }, C)
check('a non-member cannot report', r.error?.code === '42501', r)
r = await q({ table: 'cyn_reports', op: 'select', select: '*', filters: [], order: [] }, B)
check('a member cannot read the reports', r.error?.code === '42501', r)
r = await q({ table: 'cyn_reports', op: 'select', select: '*', filters: [{ col: 'status', op: 'eq', val: 'open' }], order: [] }, A)
check('an admin reads the open reports (note trimmed, status open)', r.data?.length === 1 && r.data[0].note === 'offensive banner' && r.data[0].status === 'open', r)
const reportId = r.data?.[0]?.id
r = await q({ table: 'cyn_reports', op: 'update', values: { status: 'done', handled_by: 'AAAA1111' }, filters: [{ col: 'id', op: 'eq', val: reportId }], order: [] }, B)
r = await q({ table: 'cyn_reports', op: 'select', select: 'status', filters: [{ col: 'id', op: 'eq', val: reportId }], order: [] }, A)
check('a member cannot close a report', r.data?.[0]?.status === 'open', r)
r = await q({ table: 'cyn_reports', op: 'update', values: { status: 'done', handled_by: 'AAAA1111' }, filters: [{ col: 'id', op: 'eq', val: reportId }], order: [] }, A)
r = await q({ table: 'cyn_reports', op: 'select', select: 'status', filters: [{ col: 'id', op: 'eq', val: reportId }], order: [] }, A)
check('an admin closes a report', r.data?.[0]?.status === 'done', r)

// clan donors (needs the hot schema: npx wrangler d1 execute cynosure-hot --local --file worker/d1/hot-schema.sql, same --persist-to)
const donors = async (method, who, body) => {
  const res = await fetch(`${BASE}/api/clan-donors`, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Cookie: cookie(...who) } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const row = (id, total, donations = 1, username = 'U' + id) => ({ playerId: id, username, total, donations })
const goodBoards = () => {
  const b = { soft: {}, hard: {} }
  for (const c of ['soft', 'hard']) for (const p of ['all', 'month', 'week']) b[c][p] = [row('BBBB2222', '500'), row('AAAA1111', '12000', 4)]
  return b
}
r = await donors('GET', null)
check('donors: not signed in -> 401', r.status === 401, r)
r = await donors('GET', C)
check('donors: signed in but no member -> 403', r.status === 403, r)
r = await donors('GET', A)
check('donors: member sees "no data yet"', r.status === 200 && r.body?.boards === null, r)
r = await donors('POST', ['d2', 'bob'], { boards: goodBoards() })
check('donors: a member who is no admin cannot save', r.status === 403, r)
r = await donors('POST', A, { boards: { soft: { all: [] } } })
check('donors: incomplete boards refused', r.status === 400, r)
const evil = goodBoards()
evil.soft.all[0].total = '12abc'
r = await donors('POST', A, { boards: evil })
check('donors: a bad amount is refused', r.status === 400, r)
const evil2 = goodBoards()
evil2.hard.week[0].playerId = '../../x'
r = await donors('POST', A, { boards: evil2 })
check('donors: a bad player id is refused', r.status === 400, r)
r = await donors('POST', A, { boards: goodBoards(), extra: '<script>' })
check('donors: admin saves', r.status === 200 && r.body?.ok === true, r)
r = await donors('GET', A)
check('donors: stored, sorted by amount, ranks recomputed', r.body?.boards?.soft?.all?.[0]?.playerId === 'AAAA1111' && r.body.boards.soft.all[0].rank === 1 && r.body.boards.hard.week[1].rank === 2 && r.body.by === 'AAAA1111', r)

r = await donors('POST', A, { boards: goodBoards(), recent: [{ playerId: 'BBBB2222', currency: 'soft', amount: '150', at: new Date().toISOString() }, { playerId: 'AAAA1111', currency: 'hard', amount: 100, at: '2026-10-02T10:00:00Z' }] })
check('donors: single donations are stored', r.status === 200, r)
r = await donors('GET', A)
check('donors: the single donations come back, newest first, amounts as text', r.body?.recent?.length === 2 && r.body.recent[0].amount === '150' && r.body.recent[1].amount === '100', r)
r = await donors('POST', A, { boards: goodBoards(), recent: [{ playerId: 'x y', currency: 'soft', amount: '1', at: '2026-01-01T00:00:00Z' }] })
check('donors: a bad player id in the single donations is refused', r.status === 400, r)
r = await donors('POST', A, { boards: goodBoards(), recent: [{ playerId: 'BBBB2222', currency: 'gold', amount: '1', at: '2026-01-01T00:00:00Z' }] })
check('donors: an unknown currency is refused', r.status === 400, r)
r = await donors('POST', A, { boards: goodBoards(), recent: 'nope' })
check('donors: a recent list that is no list is refused', r.status === 400, r)
// donor sync key and the userscript's ingest endpoint
const keyCall = async (method, who) => {
  const res = await fetch(`${BASE}/api/clan-donors/key`, { method, headers: who ? { Cookie: cookie(...who) } : {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const ingest = async (key, body, origin = 'https://openfront.io', method = 'POST') => {
  const res = await fetch(`${BASE}/api/clan-donors/ingest`, { method, headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null), acao: res.headers.get('access-control-allow-origin') }
}
r = await keyCall('GET', null)
check('sync key: not signed in -> 401', r.status === 401, r)
r = await keyCall('POST', B)
check('sync key: a member who is no admin and not in the inner circle is refused', r.status === 403, r)
r = await keyCall('GET', A)
check('sync key: admin has no key yet', r.status === 200 && r.body?.hasKey === false, r)
r = await keyCall('POST', A)
check('sync key: admin gets a key', r.status === 200 && /^cdk_[0-9a-f]{64}$/.test(r.body?.key ?? ''), r)
const K1 = r.body?.key
r = await keyCall('GET', A)
check('sync key: the key is registered (only its hash is kept)', r.body?.hasKey === true && !('key' in r.body), r)
r = await ingest(null, { boards: goodBoards(), recent: [] })
check('ingest: without a key -> 401', r.status === 401 && r.acao === 'https://openfront.io', r)
r = await ingest('cdk_' + '0'.repeat(64), { boards: goodBoards(), recent: [] })
check('ingest: a wrong key -> 401', r.status === 401, r)
r = await ingest(K1, { boards: goodBoards(), recent: [] }, 'https://evil.example')
check('ingest: from another site -> 403', r.status === 403, r)
r = await ingest(K1, null, 'https://openfront.io', 'OPTIONS')
check('ingest: the preflight answers for openfront.io only', r.status === 204 && r.acao === 'https://openfront.io', r)
const syncBoards = goodBoards()
syncBoards.soft.all[0].total = '777'
r = await ingest(K1, { boards: syncBoards, recent: [{ playerId: 'BBBB2222', currency: 'soft', amount: '250', at: new Date().toISOString() }] })
check('ingest: a good upload with the key is stored', r.status === 200 && r.body?.ok === true && r.acao === 'https://openfront.io', r)
r = await donors('GET', A)
check('ingest: the stored ranking shows it, written by the key owner', r.body?.by === 'AAAA1111' && r.body?.recent?.[0]?.amount === '250' && r.body?.boards?.soft?.all?.some((x) => x.total === '777'), r)
r = await ingest(K1, { boards: goodBoards(), recent: [] })
check('ingest: a second upload right away is slowed down -> 429', r.status === 429, r)
r = await keyCall('POST', A)
const K2 = r.body?.key
check('sync key: a new key replaces the old one', /^cdk_/.test(K2 ?? '') && K2 !== K1, r)
r = await ingest(K1, { boards: goodBoards(), recent: [] })
check('ingest: the old key does not work any more', r.status === 401, r)
const badBoards = goodBoards()
badBoards.soft.all[0].total = 'many'
r = await ingest(K2, { boards: badBoards, recent: [] })
check('ingest: bad data is refused -> 400 (and does not use up the key)', r.status === 400 && r.acao === 'https://openfront.io', r)
r = await ingest(K2, { boards: goodBoards(), recent: [{ playerId: 'BBBB2222', currency: 'gold', amount: '1', at: '2026-01-01T00:00:00Z' }] })
check('ingest: a bad single donation is refused -> 400', r.status === 400, r)
r = await keyCall('DELETE', A)
check('sync key: revoked', r.status === 200, r)
r = await ingest(K2, { boards: goodBoards(), recent: [] })
check('ingest: a revoked key -> 401', r.status === 401, r)
await svc('import?table=cyn_inner_circle', [{ openfront_id: 'BBBB2222' }])
r = await keyCall('POST', B)
check('sync key: a member of the inner circle may make one', r.status === 200 && /^cdk_/.test(r.body?.key ?? ''), r)
r = await donors('POST', B, { boards: goodBoards(), recent: [] })
check('donors: a member of the inner circle may also import by hand', r.status === 200, r)


// ── boosters and the card collection ──
const boost = async (method, path, who, body) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Cookie: cookie(...who) } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const BOB = ['d2', 'bob']
r = await boost('GET', '/api/boosters/me')
check('boosters: signed out -> 401', r.status === 401, r)
r = await boost('GET', '/api/boosters/me', C)
check('boosters: a visitor that is no member -> 403', r.status === 403, r)
r = await boost('GET', '/api/boosters/me', A)
check('boosters: first visit has the starter booster and the free one of today', r.status === 200 && r.body.extra === 1 && r.body.freeAvailable === true && r.body.openedToday === false, r)
r = await boost('POST', '/api/boosters/open', A)
check('boosters: the free booster comes first, 3 cards of members in known rarities', r.status === 200 && r.body.source === 'free' && r.body.cards.length === 3 && r.body.cards.every((c) => ['AAAA1111', 'BBBB2222', 'CCCC3333'].includes(c.card_id) && ['common', 'rare', 'epic', 'ultra', 'legendary'].includes(c.rarity)), r)
check('boosters: opening counts for today and the starter is still there', r.body?.state?.openedToday === true && r.body.state.freeAvailable === false && r.body.state.extra === 1 && !!r.body.state.nextFreeAt, r.body)
r = await boost('POST', '/api/boosters/open', A)
check('boosters: the second one uses the booster on hand', r.status === 200 && r.body.source === 'extra' && r.body.state.extra === 0, r)
r = await boost('POST', '/api/boosters/open', A)
check('boosters: nothing left -> 409', r.status === 409 && r.body.error === 'no_booster', r)
r = await boost('GET', '/api/boosters/collection?id=AAAA1111', A)
check('boosters: the collection has the 6 cards pulled', r.status === 200 && r.body.cards.reduce((n, c) => n + c.n, 0) === 6 && r.body.openedTotal === 2, r)
r = await boost('GET', '/api/boosters/collection?id=AAAA1111', BOB)
check('boosters: another member can look at the collection', r.status === 200 && r.body.cards.length > 0, r)
r = await boost('GET', '/api/boosters/collection?id=bad%20id!', A)
check('boosters: a bad id is refused', r.status === 400, r)
r = await boost('POST', '/api/boosters/grant', BOB, { openfront_id: 'BBBB2222', count: 5 })
check('boosters: a member that is no admin cannot grant', r.status === 403, r)
r = await boost('POST', '/api/boosters/grant', A, { openfront_id: 'BBBB2222', count: 0 })
check('boosters: a count of 0 is refused', r.status === 400, r)
r = await boost('POST', '/api/boosters/grant', A, { openfront_id: 'BBBB2222', count: 51 })
check('boosters: more than 50 at once is refused', r.status === 400, r)
r = await boost('POST', '/api/boosters/grant', A, { openfront_id: 'ZZZZ9999', count: 1 })
check('boosters: an unknown member -> 404', r.status === 404, r)
r = await boost('POST', '/api/boosters/grant', A, { openfront_id: 'BBBB2222', count: 3 })
check('boosters: an admin grants boosters (a member that never visited starts with them)', r.status === 200 && r.body.extra === 3, r)
const both = await Promise.all([boost('POST', '/api/boosters/open', BOB), boost('POST', '/api/boosters/open', BOB)])
check('boosters: two clicks at once cannot take the free booster twice', both.filter((x) => x.body?.source === 'free').length === 1 && both.every((x) => x.status === 200), both)
r = await boost('GET', '/api/boosters/me', BOB)
check('boosters: the state adds up after the two openings (one free, one from hand)', r.body.extra === 2 && r.body.openedTotal === 2, r)
r = await boost('GET', '/api/card-social', A)
check('card social: counts per member (comments and reactions written)', r.status === 200 && typeof r.body.counts === 'object', r)
r = await boost('GET', '/api/card-social')
check('card social: signed out -> 401', r.status === 401, r)

// ── the monthly card update ──
const GOOD = { COM: 80, INT: 70, ECO: 60, SPE: 50, DEF: 90, ATK: 75 }
r = await boost('GET', '/api/cards/snapshots', A)
check('cards: nobody has an update yet', r.status === 200 && Object.keys(r.body.snapshots).length === 0 && /^\d{4}-\d{2}$/.test(r.body.month), r)
r = await boost('POST', '/api/cards/update', A, { stats: { ...GOOD, COM: 100 } })
check('cards: a value above 99 is refused', r.status === 400 && r.body.error === 'bad_stats', r)
r = await boost('POST', '/api/cards/update', A, { stats: { ...GOOD, SPE: 45 } })
check('cards: a value below 46 is refused', r.status === 400, r)
r = await boost('POST', '/api/cards/update', A, { stats: { COM: 80 } })
check('cards: missing values are refused', r.status === 400, r)
r = await boost('POST', '/api/cards/update', A, { stats: { ...GOOD, COM: 80.5 } })
check('cards: a value with decimals is refused', r.status === 400, r)
r = await boost('POST', '/api/cards/update', C, { stats: GOOD })
check('cards: a visitor that is no member cannot update', r.status === 403, r)
r = await boost('POST', '/api/cards/update', A, { stats: GOOD })
check('cards: the first update works and has nothing before it', r.status === 200 && r.body.prev === null, r)
r = await boost('POST', '/api/cards/update', A, { stats: { ...GOOD, COM: 85 } })
check('cards: a second update in the same month -> 409', r.status === 409 && r.body.error === 'already_updated', r)
const two = await Promise.all([boost('POST', '/api/cards/update', BOB, { stats: GOOD }), boost('POST', '/api/cards/update', BOB, { stats: GOOD })])
check('cards: two clicks at once update once', two.filter((x) => x.status === 200).length === 1 && two.filter((x) => x.status === 409).length === 1, two)
r = await boost('GET', '/api/cards/snapshots', BOB)
check('cards: everybody can read the snapshots', r.status === 200 && r.body.snapshots.AAAA1111?.stats.DEF === 90 && r.body.snapshots.AAAA1111.prev === null, r)

// ── "I paid": requests that an admin credits with one click ──
r = await boost('POST', '/api/boosters/request', C, { count: 1 })
check('requests: a visitor that is no member -> 403', r.status === 403, r)
r = await boost('POST', '/api/boosters/request', BOB, { count: 0 })
check('requests: a count of 0 is refused', r.status === 400, r)
r = await boost('POST', '/api/boosters/request', BOB, { count: 11 })
check('requests: more than 10 is refused', r.status === 400, r)
r = await boost('POST', '/api/boosters/request', BOB, { count: 3 })
check('requests: a member says they paid for 3', r.status === 200, r)
r = await boost('POST', '/api/boosters/request', BOB, { count: 1 })
check('requests: a second open request is refused -> 409', r.status === 409 && r.body.error === 'already_open', r)
r = await boost('GET', '/api/boosters/me', BOB)
check('requests: the member sees that the request is open', r.body.pendingRequest === 3, r)
r = await boost('GET', '/api/boosters/requests', BOB)
check('requests: a member that is no admin cannot read the list', r.status === 403, r)
r = await boost('GET', '/api/boosters/requests', A)
const reqId = r.body?.requests?.[0]?.id
check('requests: an admin sees the open request with the name', r.status === 200 && r.body.requests.length === 1 && r.body.requests[0].openfront_id === 'BBBB2222' && r.body.requests[0].count === 3 && !!r.body.requests[0].name, r)
r = await boost('POST', '/api/boosters/requests/handle', BOB, { id: reqId, action: 'grant' })
check('requests: a member that is no admin cannot credit', r.status === 403, r)
r = await boost('POST', '/api/boosters/requests/handle', A, { id: reqId, action: 'steal' })
check('requests: an unknown action is refused', r.status === 400, r)
const beforeExtra = (await boost('GET', '/api/boosters/me', BOB)).body.extra
const twice = await Promise.all([boost('POST', '/api/boosters/requests/handle', A, { id: reqId, action: 'grant' }), boost('POST', '/api/boosters/requests/handle', A, { id: reqId, action: 'grant' })])
check('requests: two clicks at once credit once', twice.filter((x) => x.status === 200).length === 1, twice)
r = await boost('GET', '/api/boosters/me', BOB)
check('requests: the 3 boosters arrived and the request is closed', r.body.extra === beforeExtra + 3 && r.body.pendingRequest === null, r)
r = await boost('GET', '/api/boosters/requests', A)
check('requests: the list is empty again', r.body.requests.length === 0, r)
r = await boost('POST', '/api/boosters/request', BOB, { count: 2 })
check('requests: after it was handled a new request is possible', r.status === 200, r)
r = await boost('GET', '/api/boosters/requests', A)
r = await boost('POST', '/api/boosters/requests/handle', A, { id: r.body.requests[0].id, action: 'reject' })
check('requests: an admin can reject', r.status === 200, r)
r = await boost('GET', '/api/boosters/me', BOB)
check('requests: a rejected request credits nothing', r.body.extra === beforeExtra + 3 && r.body.pendingRequest === null, r)

r = await boost('GET', '/api/boosters/summary', A)
check('summary: different cards per rarity for every collector', r.status === 200 && typeof r.body.summary.AAAA1111 === 'object' && Object.values(r.body.summary.AAAA1111).every((n) => Number.isInteger(n) && n >= 1), r)
r = await boost('GET', '/api/boosters/summary')
check('summary: signed out -> 401', r.status === 401, r)

console.log(fails ? `${fails} FAILED` : 'ALL OK')
process.exit(fails ? 1 : 0)

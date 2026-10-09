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

r = await q({ table: 'cyn_game_nights', op: 'select', select: '*', filters: [], order: [] })
check('anon cannot read game nights', r.error?.code === '42501', r)

r = await q({ table: 'cyn_speedruns', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'g', seconds: 300 }, filters: [], order: [] })
check('anon cannot write speedrun', r.error?.code === '42501', r)

r = await q({ table: 'cyn_speedruns', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'g', seconds: 300 }, filters: [], order: [] }, A)
check('member writes own speedrun', !r.error, r)
r = await q({ table: 'cyn_speedruns', op: 'upsert', values: { openfront_id: 'AAAA1111', game_id: 'g2', seconds: 280 }, filters: [], order: [] }, A)
check('member updates own speedrun (upsert)', !r.error, r)
r = await q({ table: 'cyn_speedruns', op: 'upsert', values: { openfront_id: 'BBBB2222', game_id: 'g', seconds: 1 }, filters: [], order: [] }, A)
check('member cannot write someone elses speedrun', r.error?.code === '42501', r)
r = await q({ table: 'cyn_speedruns', op: 'select', select: '*', filters: [{ col: 'openfront_id', op: 'eq', val: 'AAAA1111' }], order: [], single: 'maybe' })
check('speedrun readable + updated', r.data?.seconds === 280, r)

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

// reactions
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

// event submissions forced pending
r = await q({ table: 'cyn_event_submissions', op: 'insert', values: { event_id: 'e', team_id: 't', submitted_by: 'x', game_link: 'https://a', screenshot_url: 'https://b', category: 'public', points: 1, status: 'accepted' }, filters: [], order: [] })
check('submission insert (anon)', !r.error, r)
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

console.log(fails ? `${fails} FAILED` : 'ALL OK')
process.exit(fails ? 1 : 0)

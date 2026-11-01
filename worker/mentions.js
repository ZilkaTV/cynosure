// @mentions in comments: "@Calos nice game" notifies the member Calos. Shared by the Worker (who gets notified, worker/dbApi.js) and the pages (the highlighted
// names in a comment, the suggestions while typing), so both read a comment the same way.

const WORD = /[\p{L}\p{N}_]/u
const MAX_NOTIFIED = 5

/** The ways a member can be written after the @: the registered name, and the same without a clan tag in front ("[CYN] Bane", "CYN Bane" -> "Bane"). */
export function nameVariants(name) {
  const full = String(name ?? '').trim()
  const bare = full.replace(/^\s*(?:\[\s*cyn\s*\]|\(\s*cyn\s*\)|cyn)(?=[\s:_.\-|\]]|$)[\s:_.\-|\]]*/iu, '').trim()
  return [...new Set([full, bare])].filter((v) => v.length >= 2)
}

/**
 * Where in a text which members are mentioned: [{ start, end, id }] sorted by position, `end` after the name. A mention is "@" + a member's name, the "@" not
 * in the middle of a word (no e-mail addresses) and the name not continued by a letter or digit. The longest name wins ("@Bob Smith" before "@Bob").
 * `members`: [{ openfront_id, in_game_name }].
 */
export function scanMentions(body, members) {
  const text = String(body ?? '')
  if (!text.includes('@')) return []
  const lower = text.toLowerCase()
  const candidates = []
  for (const m of members ?? []) {
    for (const v of nameVariants(m.in_game_name)) candidates.push({ v: v.toLowerCase(), id: m.openfront_id })
  }
  candidates.sort((a, b) => b.v.length - a.v.length)
  const found = []
  for (const c of candidates) {
    const needle = '@' + c.v
    for (let from = lower.indexOf(needle); from !== -1; from = lower.indexOf(needle, from + 1)) {
      const end = from + needle.length
      const before = from > 0 ? text[from - 1] : ''
      const after = end < text.length ? text[end] : ''
      if (before && WORD.test(before)) continue
      if (after && WORD.test(after)) continue
      if (found.some((f) => from < f.end && end > f.start)) continue
      found.push({ start: from, end, id: c.id })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

/** The text cut into pieces: [{ text }] and, for a mention, [{ text, id }]. */
export function splitMentions(body, members) {
  const text = String(body ?? '')
  const out = []
  let at = 0
  for (const f of scanMentions(text, members)) {
    if (f.start > at) out.push({ text: text.slice(at, f.start) })
    out.push({ text: text.slice(f.start, f.end), id: f.id })
    at = f.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** The members who are notified by a comment: the mentioned ones, once each, not the author, at most a few (a comment cannot call the whole clan). */
export function mentionedIds(body, members, authorId) {
  const ids = []
  for (const f of scanMentions(body, members)) {
    if (f.id !== authorId && !ids.includes(f.id)) ids.push(f.id)
  }
  return ids.slice(0, MAX_NOTIFIED)
}

/**
 * The statement that records the mentions of a comment that was just inserted in the same batch (after the INSERT of the comment, see `after` in
 * worker/dbApi.js). `table` is the comment table (cyn_game_comments | cyn_profile_comments), `kind` 'game' | 'profile', `ref` the game or profile id.
 * The id of the new comment is the newest one of its author. [] when nobody is mentioned.
 */
export async function mentionStatements(db, { table, kind, ref, authorId, body }) {
  if (!String(body ?? '').includes('@')) return []
  const { results } = await db.prepare('SELECT openfront_id, in_game_name FROM cyn_members').all()
  const ids = mentionedIds(body, results ?? [], authorId)
  if (ids.length === 0) return []
  // a database that has not got the table yet (migration 013 not run): the comment is saved without notifying anybody instead of failing
  if (!(await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'cyn_mentions'").first())) return []
  return [
    db
      .prepare(
        `INSERT INTO cyn_mentions (mentioned_id, author_id, kind, comment_id, ref_id) SELECT value, ?, ?, (SELECT MAX(id) FROM ${table} WHERE author_openfront_id = ?), ? FROM json_each(?)`,
      )
      .bind(authorId, kind, authorId, ref, JSON.stringify(ids)),
  ]
}

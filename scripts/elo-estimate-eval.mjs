#!/usr/bin/env node
// Experiment: how well can a member's 1v1 Elo be estimated from the games this site already has?
// Data: every member's ranked 1v1 games (D1 member_games) whose detail is cached (D1 game_detail) so the opponent's
// public id is known. Anchors: the official top-100 boards (known Elo). Method: maximum-a-posteriori rating with a
// logistic (Elo) likelihood and a Gaussian prior around 1500; known players are fixed, the others are fitted.
// Evaluation: leave-one-out on members who ARE in the top 100 - hide their official Elo, estimate it, compare.
//
//   (env: HOT_API_SECRET or CLOUDFLARE_* for D1)   node scripts/elo-estimate-eval.mjs <roster.json>
import fs from 'node:fs'
import { hotEnabled, hotGetAllMemberGames, hotGetDetails } from './lib/hotstore.mjs'

const PRIOR = 1500
const PRIOR_SD = Number(process.env.PRIOR_SD ?? 350)
const Q = Math.log(10) / 400

async function main() {
  if (!hotEnabled()) throw new Error('D1 env missing')
  const roster = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const official = new Map(Object.entries(roster.ranked_1v1 ?? {}).map(([id, e]) => [id, e.elo]))

  const members = await hotGetAllMemberGames()
  const memberIds = new Set(members.map((m) => m.openfront_id))
  const games = []
  for (const m of members) for (const g of m.games) if (g.rankedType === '1v1' && (g.result === 'victory' || g.result === 'defeat')) games.push({ id: g.gameId, me: m.openfront_id, won: g.result === 'victory' })
  console.log(`members ${memberIds.size}, ranked 1v1 games with a result: ${games.length}`)

  const details = await hotGetDetails([...new Set(games.map((g) => g.id))])
  console.log(`with cached detail: ${details.size}`)
  const edges = []
  for (const g of games) {
    const d = details.get(g.id)
    if (!d) continue
    const players = d.players ?? []
    const me = players.find((p) => p.publicID === g.me) ?? players.find((p) => p.clientID && p.username)
    const opp = players.find((p) => p.publicID && p.publicID !== g.me)
    if (!opp?.publicID || !players.some((p) => p.publicID === g.me)) continue
    edges.push({ a: g.me, b: opp.publicID, aWon: g.won })
  }
  console.log(`edges (me vs known opponent id): ${edges.length}, with publicID info on ${edges.length ? 'yes' : 'no'}`)
  fs.writeFileSync(process.argv[3] ?? 'elo-edges.json', JSON.stringify(edges))
  console.log('players in top-100 among members:', [...memberIds].filter((id) => official.has(id)).length)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

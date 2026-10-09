#!/usr/bin/env node
// Leave-one-out check of the MAP Elo estimator on the edge list written by elo-estimate-eval.mjs.
//   node scripts/elo-estimate-fit.mjs <edges.json> <roster.json> [priorSd=350]
import fs from 'node:fs'

const [edgesPath, rosterPath, sdArg] = process.argv.slice(2)
const SD = Number(sdArg ?? 350)
const Q = Math.log(10) / 400
const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf8'))
const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'))
const official = new Map(Object.entries(roster.ranked_1v1 ?? {}).map(([id, e]) => [id, e.elo]))
const sigmoid = (x) => 1 / (1 + Math.exp(-x))

/** MAP ratings: `known` players are fixed, everyone else in the edge list is fitted (Newton steps per player, sweeping). */
export function fit(edgeList, known, sd = SD) {
  const r = new Map()
  const adj = new Map()
  for (const e of edgeList) {
    for (const [p, o, won] of [[e.a, e.b, e.aWon], [e.b, e.a, !e.aWon]]) {
      if (!adj.has(p)) adj.set(p, [])
      adj.get(p).push({ o, won })
    }
  }
  for (const id of adj.keys()) r.set(id, known.get(id) ?? 1500)
  for (const [id, v] of known) if (adj.has(id)) r.set(id, v)
  for (let sweep = 0; sweep < 60; sweep++) {
    let moved = 0
    for (const [p, list] of adj) {
      if (known.has(p)) continue
      let x = r.get(p)
      for (let it = 0; it < 3; it++) {
        let g = -(x - 1500) / (sd * sd)
        let h = -1 / (sd * sd)
        for (const { o, won } of list) {
          const pr = sigmoid(Q * (x - r.get(o)))
          g += Q * ((won ? 1 : 0) - pr)
          h -= Q * Q * pr * (1 - pr)
        }
        x -= Math.max(-150, Math.min(150, g / h))
      }
      moved = Math.max(moved, Math.abs(x - r.get(p)))
      r.set(p, x)
    }
    if (moved < 0.05) break
  }
  return { r, adj }
}

const games = new Map()
for (const e of edges) for (const p of [e.a, e.b]) games.set(p, (games.get(p) ?? 0) + 1)

const rows = []
for (const [id, truth] of official) {
  const n = games.get(id) ?? 0
  if (n < 5) continue
  const known = new Map([...official].filter(([k]) => k !== id))
  const { r } = fit(edges, known)
  rows.push({ id, truth, est: r.get(id), n })
}
const err = rows.map((x) => x.est - x.truth)
const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / Math.max(1, err.length))
const mean = err.reduce((s, e) => s + e, 0) / Math.max(1, err.length)
console.log(`prior sd ${SD}: members tested ${rows.length}, RMSE ${rmse.toFixed(0)}, mean error ${mean.toFixed(0)}`)
const byN = [[5, 9], [10, 19], [20, 1e9]]
for (const [lo, hi] of byN) {
  const sub = rows.filter((x) => x.n >= lo && x.n <= hi)
  if (!sub.length) continue
  const e2 = sub.map((x) => x.est - x.truth)
  console.log(`  ${lo}-${hi === 1e9 ? '+' : hi} games: n=${sub.length} RMSE ${Math.sqrt(e2.reduce((s, e) => s + e * e, 0) / sub.length).toFixed(0)}`)
}
// A trivial baseline for comparison: everyone at the average official Elo of the tested set.
const avg = rows.reduce((s, x) => s + x.truth, 0) / Math.max(1, rows.length)
console.log(`baseline (constant ${avg.toFixed(0)}) RMSE ${Math.sqrt(rows.reduce((s, x) => s + (avg - x.truth) ** 2, 0) / Math.max(1, rows.length)).toFixed(0)}`)

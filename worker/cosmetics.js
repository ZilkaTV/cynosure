// GET /api/cosmetics?scope=cyn|all: the skin patterns, flags and crowns of OpenFront's store (public data, GET https://api.openfront.io/cosmetics.json).
// scope=cyn (default): only what carries the clan's affiliate code, i.e. the items of the CYN store (https://openfront.io/#modal=store&affiliateCode=cyn).
// The browser may not read OpenFront's file itself (it only allows openfront.io), so the Worker does; the router puts the Cache API in front (1 hour).
const AFFILIATE = 'cyn'
const SOURCE = 'https://api.openfront.io/cosmetics.json'
// items that are in OpenFront's file but are not in the store (they cannot be bought)
const HIDDEN = new Set(['cyn_2'])

import { getShopState } from './donorBot.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleCosmetics(request, env) {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
  const all = new URL(request.url).searchParams.get('scope') === 'all'
  try {
    const res = await fetch(SOURCE, { headers: { Accept: 'application/json', 'User-Agent': 'CynClanBot/1.0 (+https://cynclan.com)' }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`openfront ${res.status}`)
    const src = await res.json()
    const keep = (it) => !HIDDEN.has(it?.name) && (all || String(it?.affiliateCode ?? '').toLowerCase() === AFFILIATE)
    // when the CYN bot first saw an item of the clan store (the Skin Shop page marks the ones of the last 14 days as new)
    const shop = env ? await getShopState(env).catch(() => null) : null
    const NEW_MS = 14 * 86_400_000
    const isNew = (kind, id) => {
      const at = shop?.items?.[`${kind}:${id}`]?.firstSeen
      return !!at && Date.now() - Date.parse(at) < NEW_MS
    }
    const palettes = src.colorPalettes ?? {}
    const colors = (name) => (palettes[name] ? { name, primary: palettes[name].primaryColor, secondary: palettes[name].secondaryColor } : null)
    const base = (kind) => (id, it) => ({ id, name: it.name ?? id, rarity: it.rarity ?? null, artist: it.artist ?? null, price: it.priceHard ?? null, cyn: String(it.affiliateCode ?? '').toLowerCase() === AFFILIATE, paid: !!it.product, isNew: isNew(kind, id) })
    const patterns = Object.entries(src.patterns ?? {})
      .filter(([, it]) => keep(it))
      .map(([id, it]) => ({
        ...base('pattern')(id, it),
        pattern: it.pattern,
        palettes: (it.colorPalettes ?? []).filter((p) => !p.isArchived).map((p) => colors(p.name)).filter(Boolean).slice(0, 4),
      }))
    const withUrl = (group, kind) =>
      Object.entries(src[group] ?? {})
        .filter(([, it]) => keep(it) && typeof it.url === 'string' && it.url.startsWith('https://cdn.ofedge.io/'))
        .map(([id, it]) => ({ ...base(kind)(id, it), url: it.url }))
    return json(200, { scope: all ? 'all' : 'cyn', patterns, flags: withUrl('flags', 'flag'), crowns: withUrl('crowns', 'crown'), updatedAt: shop?.updated_at ?? null, storeUrl: `https://openfront.io/#modal=store&affiliateCode=${AFFILIATE}` })
  } catch (err) {
    return json(502, { error: 'cosmetics_unavailable', message: String(err?.message ?? err).slice(0, 120) })
  }
}

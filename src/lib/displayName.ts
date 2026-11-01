/**
 * Display-only cleanup for player names: four or more of the same character
 * in a row collapse to one ("Franquitooooooo..." -> "Franquito"), case
 * insensitive. Names are only ever shortened where they're SHOWN - matching
 * (e.g. finding a member's own entry in a game's player list) keeps using
 * the raw name. Real names with a double or triple letter ("Missouri",
 * "ashfalllive") are untouched.
 */
export function cleanDisplayName(name: string): string {
  return name.replace(/(.)\1{3,}/giu, '$1')
}

/**
 * The letter that stands in for a member without an icon: the first letter of the name, a clan tag in front is ignored
 * ("CYN Bane" and "[CYN] Bane" -> B, "soothxng" -> S).
 */
export function initialOf(name: string): string {
  const bare = cleanDisplayName(name).replace(/^\s*(?:\[\s*cyn\s*\]|\(\s*cyn\s*\)|cyn)(?=[\s:_.\-|\]]|$)[\s:_.\-|\]]*/iu, '')
  const letter = bare.match(/[\p{L}\p{N}]/u)?.[0] ?? cleanDisplayName(name).match(/[\p{L}\p{N}]/u)?.[0] ?? '?'
  return letter.toUpperCase()
}

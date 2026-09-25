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

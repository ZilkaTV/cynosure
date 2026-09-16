// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 129cfcb1c3e7986de1a8007a024905bbadb36526.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/129cfcb1c3e7986de1a8007a024905bbadb36526/src/core/game/Veterancy.ts
// Unmodified copy - see src/vendor/openfront-core-129cfcb/README.md.
// Shared warship-veterancy math. Lives in src/core (integer percent math, no
// floats) so the engine and the renderer derive identical effective max health.

/**
 * Effective max health for a warship at a given veterancy level.
 *
 * Each veterancy level adds `healthBonusPercent`% of base max health, floored to
 * an integer to keep src/core deterministic. Returns `baseMaxHealth` unchanged
 * at veterancy 0 (and therefore for any non-veteran or non-warship unit).
 */
export function maxHealthWithVeterancy(
  baseMaxHealth: number,
  veterancy: number,
  healthBonusPercent: number,
): number {
  if (veterancy <= 0) {
    return baseMaxHealth;
  }
  return (
    baseMaxHealth +
    Math.floor((baseMaxHealth * veterancy * healthBonusPercent) / 100)
  );
}

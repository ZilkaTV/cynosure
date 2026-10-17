// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 538d205f1279d5037e28fb933e631c612550f5ff.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/538d205f1279d5037e28fb933e631c612550f5ff/packages/engine-lib/src/game/Veterancy.ts
// Unmodified copy - see src/vendor/openfront-core-538d205/README.md.
// Shared warship-veterancy math. Lives in engine-lib (integer percent math, no
// floats) so the engine and the renderer derive identical effective max health.

/**
 * Effective max health for a warship at a given veterancy level.
 *
 * Each veterancy level adds `healthBonusPercent`% of base max health, floored to
 * an integer to keep the engine deterministic. Returns `baseMaxHealth` unchanged
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

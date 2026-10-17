// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 08b63c054897c030e6516e0731ab7cc62b2998b7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/08b63c054897c030e6516e0731ab7cc62b2998b7/packages/engine-lib/src/game/Veterancy.ts
// Unmodified copy - see src/vendor/openfront-core-08b63c0/README.md.
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 09aa423bceb993cae9c7b4dd3643f55e150ba612.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/09aa423bceb993cae9c7b4dd3643f55e150ba612/packages/engine-lib/src/game/Veterancy.ts
// Unmodified copy - see src/vendor/openfront-core-09aa423/README.md.
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

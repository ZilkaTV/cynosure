// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d53d6c339fefe0291782e1530242a771a44c9e91.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d53d6c339fefe0291782e1530242a771a44c9e91/src/core/game/Veterancy.ts
// Unmodified copy - see src/vendor/openfront-core-d53d6c3/README.md.
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b45be57542f5f8cce8380c4a75d816674a1dabe.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b45be57542f5f8cce8380c4a75d816674a1dabe/src/core/utilities/RenderNumber.ts
// Unmodified copy - see src/vendor/openfront-core-8b45be5/README.md.
// Locally authored for Cynosure - not an upstream OpenFrontIO file.
// Extracted from OpenFrontIO's src/client/Utils.ts (renderNumber/renderTroops
// only) at commit 8b45be57542f5f8cce8380c4a75d816674a1dabe - this commit's body differs from the shared
// canonical extract (src/vendor/openfront-core/.../RenderNumber.ts), so this
// tree gets its OWN copy instead of reusing that one.
// Licensed AGPL-3.0-or-later - see openfront-core-8b45be5/README.md.

export function renderNumber(
  num: number | bigint,
  fixedPoints?: number,
): string {
  num = Number(num);
  num = Math.max(num, 0);

  if (num >= 10_000_000_000) {
    const value = Math.floor(num / 100000000) / 10;
    return value.toFixed(fixedPoints ?? 1) + "B";
  } else if (num >= 1_000_000_000) {
    const value = Math.floor(num / 10000000) / 100;
    return value.toFixed(fixedPoints ?? 2) + "B";
  } else if (num >= 10_000_000) {
    const value = Math.floor(num / 100000) / 10;
    return value.toFixed(fixedPoints ?? 1) + "M";
  } else if (num >= 1_000_000) {
    const value = Math.floor(num / 10000) / 100;
    return value.toFixed(fixedPoints ?? 2) + "M";
  } else if (num >= 100000) {
    return Math.floor(num / 1000) + "K";
  } else if (num >= 10000) {
    const value = Math.floor(num / 100) / 10;
    return value.toFixed(fixedPoints ?? 1) + "K";
  } else if (num >= 1000) {
    const value = Math.floor(num / 10) / 100;
    return value.toFixed(fixedPoints ?? 2) + "K";
  } else {
    return Math.floor(num).toString();
  }
}

export function renderTroops(troops: number): string {
  return renderNumber(troops / 10);
}

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b/src/core/utilities/RenderNumber.ts
// Unmodified copy - see src/vendor/openfront-core-2d5baaf/README.md.
// Locally authored for Cynosure - not an upstream OpenFrontIO file.
// Extracted from OpenFrontIO's src/client/Utils.ts (renderNumber/renderTroops
// only) at commit 2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b - this commit's body differs from the shared
// canonical extract (src/vendor/openfront-core/.../RenderNumber.ts), so this
// tree gets its OWN copy instead of reusing that one.
// Licensed AGPL-3.0-or-later - see openfront-core-2d5baaf/README.md.

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

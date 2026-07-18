// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 53e1a5b03e35c27a3130c1c534f9416b8d6c724f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/53e1a5b03e35c27a3130c1c534f9416b8d6c724f/src/core/utilities/RenderNumber.ts
// Unmodified copy - see src/vendor/openfront-core-53e1a5b/README.md.
// Locally authored for Cynosure - not an upstream OpenFrontIO file.
// Extracted from OpenFrontIO's src/client/Utils.ts (renderNumber/renderTroops
// only, unchanged between the aeb8d60 and dcc18d5 vendoring passes) at
// commit 53e1a5b03e35c27a3130c1c534f9416b8d6c724f - the full file also pulls
// in intl-messageformat, LangSelector, and Platform for chat/UI translation,
// none of which the headless simulation needs.
// Licensed AGPL-3.0-or-later - see src/vendor/openfront-core/openfront-core-53e1a5b/README.md.

export function renderNumber(num: number | bigint, fixedPoints?: number): string {
  num = Number(num);
  num = Math.max(num, 0);

  if (num >= 10_000_000) {
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

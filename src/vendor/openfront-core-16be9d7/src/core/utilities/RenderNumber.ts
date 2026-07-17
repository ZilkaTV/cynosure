// Locally authored for Cynosure - not an upstream OpenFrontIO file.
// Extracted from OpenFrontIO's src/client/Utils.ts (renderNumber/renderTroops
// only, unchanged across the aeb8d60, dcc18d5, and 16be9d7 vendoring passes)
// at commit 16be9d7c15d7abc115691def3a0b2aa559664705 - the full file also
// pulls in intl-messageformat, LangSelector, and Platform for chat/UI
// translation, none of which the headless simulation needs.
// Licensed AGPL-3.0-or-later - see src/vendor/openfront-core-16be9d7/README.md.

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

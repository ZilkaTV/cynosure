// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b45be57542f5f8cce8380c4a75d816674a1dabe.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b45be57542f5f8cce8380c4a75d816674a1dabe/src/core/execution/utils/TribeNames.ts
// Modified for this vendor build (auto-trimmed by scripts/vendor-engine.mjs) -
// repointed the resources/tribeNameThemes.json path-alias import at the vendored copy with a relative import.
import tribeNameThemesData from "../../../../resources/tribeNameThemes.json";
import {
  type CustomTribe,
  GameMapType,
  type MapInfo,
  maps,
} from "../../game/Maps.gen";

export interface TribeNameData {
  prefixes: string[];
  suffixes: string[];
  customTribes?: CustomTribe[];
}

interface TribeNameTheme {
  prefixes: string[];
  suffixes: string[];
}

const tribeNameThemes: Record<string, TribeNameTheme> = tribeNameThemesData;

/** Look up MapInfo by GameMapType. */
function getMapInfo(mapType: GameMapType): MapInfo | undefined {
  return maps.find((m) => m.type === mapType);
}

/**
 * Resolve tribe name data for a given map type.
 *
 * Priority:
 * 1. Custom tribes from the map's info.json (used as-is, no prefix/suffix)
 * 2. Theme-based names (prefix + suffix) from the referenced theme
 * 3. Default theme if no theme is specified or the referenced theme is missing
 */
export function resolveTribeNameData(mapType?: GameMapType): TribeNameData {
  if (mapType !== undefined) {
    const mapInfo = getMapInfo(mapType);
    if (mapInfo !== undefined) {
      const themeNames =
        mapInfo.themes !== undefined && mapInfo.themes.length > 0
          ? mapInfo.themes
          : ["default"];

      const mergedPrefixes: string[] = [];
      const mergedSuffixes: string[] = [];

      for (const themeName of themeNames) {
        const theme = tribeNameThemes[themeName];
        if (theme === undefined) {
          console.warn(
            `[TribeNames] Map "${mapType}" references unknown tribe name theme "${themeName}". Skipping.`,
          );
          continue;
        }
        mergedPrefixes.push(...theme.prefixes);
        mergedSuffixes.push(...theme.suffixes);
      }

      // If all themes were unknown, fall back to default.
      if (mergedPrefixes.length === 0 || mergedSuffixes.length === 0) {
        const defaultTheme = tribeNameThemes["default"];
        if (defaultTheme === undefined) {
          throw new Error(
            "[TribeNames] Default theme is missing from tribeNameThemes.json",
          );
        }
        mergedPrefixes.push(...defaultTheme.prefixes);
        mergedSuffixes.push(...defaultTheme.suffixes);
      }

      return {
        prefixes: mergedPrefixes,
        suffixes: mergedSuffixes,
        customTribes:
          mapInfo.customTribes !== undefined && mapInfo.customTribes.length > 0
            ? mapInfo.customTribes
            : undefined,
      };
    }
  }

  // No map type or map not found — use default theme.
  const defaultTheme = tribeNameThemes["default"];
  if (defaultTheme === undefined) {
    throw new Error(
      "[TribeNames] Default theme is missing from tribeNameThemes.json",
    );
  }
  return {
    prefixes: defaultTheme.prefixes,
    suffixes: defaultTheme.suffixes,
  };
}

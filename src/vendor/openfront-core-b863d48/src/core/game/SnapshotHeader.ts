// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit b863d48df10f3b3a1460d57096d6447adf856315.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/b863d48df10f3b3a1460d57096d6447adf856315/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-b863d48/README.md.
import { ClientID, GameConfig } from "../Schemas";

/** What a snapshot holds that a host needs before it can restore it. */
export interface SnapshotHeader {
  format: number;
  gitCommit: string;
  gameID: string | null;
  tick: number;
  gameConfig: GameConfig;
  /** The human players, by the clientID their intents must carry. */
  humans: { clientID: ClientID; name: string }[];
}

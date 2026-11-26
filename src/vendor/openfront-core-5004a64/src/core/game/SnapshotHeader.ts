// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 5004a6420d1ba5743291c56ed688b42b5f9e8e10.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/5004a6420d1ba5743291c56ed688b42b5f9e8e10/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-5004a64/README.md.
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

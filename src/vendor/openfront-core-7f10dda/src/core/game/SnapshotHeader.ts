// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7f10dda6629bbcfbd782948ba39acce8efca84f1.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7f10dda6629bbcfbd782948ba39acce8efca84f1/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-7f10dda/README.md.
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

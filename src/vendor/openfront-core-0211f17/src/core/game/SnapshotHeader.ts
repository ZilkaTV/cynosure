// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0211f17b71efa762242b620b91ffa5d8439522e6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0211f17b71efa762242b620b91ffa5d8439522e6/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-0211f17/README.md.
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

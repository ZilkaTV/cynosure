// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a9780cf68b5ef7210b1917bcda138054e9986add.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a9780cf68b5ef7210b1917bcda138054e9986add/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-a9780cf/README.md.
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

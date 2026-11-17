// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 295829ac34a4e7043af1759be238438783720a4e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/295829ac34a4e7043af1759be238438783720a4e/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-295829a/README.md.
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

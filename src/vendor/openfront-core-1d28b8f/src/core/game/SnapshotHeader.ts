// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1d28b8f2595f8cb60e6a554318b16d583212036d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1d28b8f2595f8cb60e6a554318b16d583212036d/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-1d28b8f/README.md.
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

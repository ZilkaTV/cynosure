// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bc3e3334c573c4959ec6a6745df6826d07233b4d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bc3e3334c573c4959ec6a6745df6826d07233b4d/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-bc3e333/README.md.
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

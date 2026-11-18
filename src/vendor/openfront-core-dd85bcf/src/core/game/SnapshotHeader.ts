// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dd85bcfb8b20e599fae15298bf56db1e92947f61.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dd85bcfb8b20e599fae15298bf56db1e92947f61/packages/engine-api/src/game/SnapshotHeader.ts
// Unmodified copy - see src/vendor/openfront-core-dd85bcf/README.md.
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

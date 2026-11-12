// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b5d071eed95f07c701b32e4c64e95b03f8577c1.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b5d071eed95f07c701b32e4c64e95b03f8577c1/packages/engine-lib/src/game/TerraNulliusImpl.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { TerraNullius } from "./GameTypes";
import { ClientID } from "../Schemas";

export class TerraNulliusImpl implements TerraNullius {
  constructor() {}
  smallID(): number {
    return 0;
  }
  clientID(): ClientID {
    return "TERRA_NULLIUS_CLIENT_ID";
  }

  id() {
    return null;
  }

  isPlayer(): false {
    return false as const;
  }
}

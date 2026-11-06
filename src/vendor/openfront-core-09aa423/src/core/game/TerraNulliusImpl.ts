// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 09aa423bceb993cae9c7b4dd3643f55e150ba612.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/09aa423bceb993cae9c7b4dd3643f55e150ba612/packages/engine-lib/src/game/TerraNulliusImpl.ts
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

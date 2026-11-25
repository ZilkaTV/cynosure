// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a9780cf68b5ef7210b1917bcda138054e9986add.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a9780cf68b5ef7210b1917bcda138054e9986add/packages/engine-lib/src/game/TerraNulliusImpl.ts
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

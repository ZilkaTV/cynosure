// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 5004a6420d1ba5743291c56ed688b42b5f9e8e10.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/5004a6420d1ba5743291c56ed688b42b5f9e8e10/packages/engine-lib/src/game/TerraNulliusImpl.ts
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

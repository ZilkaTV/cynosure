// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 08b63c054897c030e6516e0731ab7cc62b2998b7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/08b63c054897c030e6516e0731ab7cc62b2998b7/packages/engine-lib/src/game/TerraNulliusImpl.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { ClientID } from "../Schemas";
import { TerraNullius } from "./GameTypes";

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

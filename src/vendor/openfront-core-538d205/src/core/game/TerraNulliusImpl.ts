// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 538d205f1279d5037e28fb933e631c612550f5ff.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/538d205f1279d5037e28fb933e631c612550f5ff/packages/engine-lib/src/game/TerraNulliusImpl.ts
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit c144d134d1503191b4c3fd9a866fc583b9ecea4a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/c144d134d1503191b4c3fd9a866fc583b9ecea4a/packages/engine-lib/src/game/TerraNulliusImpl.ts
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

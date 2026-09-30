// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d7075bface21e6835fadb7a0d0025455f8bc358a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d7075bface21e6835fadb7a0d0025455f8bc358a/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-d7075bf/README.md.
import { ClientID } from "../Schemas";
import { TerraNullius } from "./Game";

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

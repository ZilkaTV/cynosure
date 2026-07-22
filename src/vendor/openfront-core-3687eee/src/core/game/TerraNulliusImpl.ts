// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3687eee03bec116b7d19f470bffdd62648180372.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3687eee03bec116b7d19f470bffdd62648180372/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-3687eee/README.md.
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

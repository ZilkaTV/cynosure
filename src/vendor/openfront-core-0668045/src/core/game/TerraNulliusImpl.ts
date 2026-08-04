// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0668045fa926eaa6d6995561a8e13fd8126895b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0668045fa926eaa6d6995561a8e13fd8126895b6/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-0668045/README.md.
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

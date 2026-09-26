// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a188868bc16c25caa2d3b5b5cb4b929663f7b5ad.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a188868bc16c25caa2d3b5b5cb4b929663f7b5ad/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-a188868/README.md.
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

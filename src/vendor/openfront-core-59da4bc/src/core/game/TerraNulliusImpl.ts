// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 59da4bc1bfaacaad02d782b988fd3e228037aff7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/59da4bc1bfaacaad02d782b988fd3e228037aff7/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-59da4bc/README.md.
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

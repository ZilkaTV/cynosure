// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3f5633b92c9508461e6e2b9e1f926487a1804c9f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3f5633b92c9508461e6e2b9e1f926487a1804c9f/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-3f5633b/README.md.
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

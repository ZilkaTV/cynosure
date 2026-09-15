// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8ab4aa2f57859a596acc0daeb5b26524c564e997.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8ab4aa2f57859a596acc0daeb5b26524c564e997/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-8ab4aa2/README.md.
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2be7dfe239ea26d01f566910fb6f50b059c89e8a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2be7dfe239ea26d01f566910fb6f50b059c89e8a/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-2be7dfe/README.md.
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

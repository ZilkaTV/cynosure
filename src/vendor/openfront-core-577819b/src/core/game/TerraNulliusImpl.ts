// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 577819ba0e1e13ecdbc8dede2ba33de542c88a67.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/577819ba0e1e13ecdbc8dede2ba33de542c88a67/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-577819b/README.md.
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

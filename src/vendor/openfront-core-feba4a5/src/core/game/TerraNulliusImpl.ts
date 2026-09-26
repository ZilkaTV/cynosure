// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit feba4a51c33475a184d9c42e35cc5e55829ee3ca.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/feba4a51c33475a184d9c42e35cc5e55829ee3ca/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-feba4a5/README.md.
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dfd9e478b64d92fa25f95597b8cb81d8adee004d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dfd9e478b64d92fa25f95597b8cb81d8adee004d/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-dfd9e47/README.md.
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

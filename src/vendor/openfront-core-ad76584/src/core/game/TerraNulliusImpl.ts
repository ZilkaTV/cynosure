// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ad765842bac44be72a8dc91a9e23369f8fa57744.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ad765842bac44be72a8dc91a9e23369f8fa57744/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-ad76584/README.md.
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

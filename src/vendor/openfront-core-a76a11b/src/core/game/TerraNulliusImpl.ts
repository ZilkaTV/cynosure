// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a76a11b837e80b6209bc234f9c3b20c5f4c0c738.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a76a11b837e80b6209bc234f9c3b20c5f4c0c738/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-a76a11b/README.md.
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

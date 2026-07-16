// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dcc18d5231af6253b0e991bf04a4c764982fe262.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dcc18d5231af6253b0e991bf04a4c764982fe262/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core/README.md.
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 129cfcb1c3e7986de1a8007a024905bbadb36526.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/129cfcb1c3e7986de1a8007a024905bbadb36526/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-129cfcb/README.md.
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

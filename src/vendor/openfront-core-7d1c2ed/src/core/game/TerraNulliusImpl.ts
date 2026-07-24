// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7d1c2edfb68e6d4ce6575eea0270f87832a17eda.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7d1c2edfb68e6d4ce6575eea0270f87832a17eda/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-7d1c2ed/README.md.
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

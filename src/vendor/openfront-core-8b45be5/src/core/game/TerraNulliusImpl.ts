// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b45be57542f5f8cce8380c4a75d816674a1dabe.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b45be57542f5f8cce8380c4a75d816674a1dabe/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-8b45be5/README.md.
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

// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 824d1412be580da8a1309010d00f984483ad2c31.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/824d1412be580da8a1309010d00f984483ad2c31/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-824d141/README.md.
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

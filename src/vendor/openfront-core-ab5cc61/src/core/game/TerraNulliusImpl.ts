// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ab5cc6115080f19b4e65b43fbfd396aaf6150e4f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ab5cc6115080f19b4e65b43fbfd396aaf6150e4f/packages/engine-lib/src/game/TerraNulliusImpl.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { ClientID } from "../Schemas";
import { TerraNullius } from "./GameTypes";

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

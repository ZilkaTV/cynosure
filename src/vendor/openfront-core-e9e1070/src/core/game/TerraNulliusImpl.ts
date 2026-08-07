// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit e9e10703e8188f2a34defdeda9598778a934094a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/e9e10703e8188f2a34defdeda9598778a934094a/src/core/game/TerraNulliusImpl.ts
// Unmodified copy - see src/vendor/openfront-core-e9e1070/README.md.
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

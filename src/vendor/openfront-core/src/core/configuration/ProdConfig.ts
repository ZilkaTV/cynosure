// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d/src/core/configuration/ProdConfig.ts
// Modified for this vendor build: added an explicit ServerConfig type
// annotation on prodConfig. This vendor tsconfig builds as a composite
// project (declaration: true, for cross-project type resolution - see its
// tsconfig.json), and TS can't emit a declaration for an exported anonymous
// class that extends a class with private members (DefaultServerConfig has
// a private `publicKey`) without one. See src/vendor/openfront-core/README.md.
import { GameEnv, ServerConfig } from "./Config";
import { DefaultServerConfig } from "./DefaultConfig";

export const prodConfig: ServerConfig = new (class extends DefaultServerConfig {
  numWorkers(): number {
    return 20;
  }
  env(): GameEnv {
    return GameEnv.Prod;
  }
  jwtAudience(): string {
    return "openfront.io";
  }
  turnstileSiteKey(): string {
    return "0x4AAAAAACFLkaecN39lS8sk";
  }
})();

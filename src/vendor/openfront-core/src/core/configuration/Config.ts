// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d/src/core/configuration/Config.ts
// Modified for this vendor build - see src/vendor/openfront-core/README.md
// for exactly what changed and why (rendering-only references stripped, or
// GameRunner's config loader swapped for a direct instantiation).
import { JWK } from "jose";
import {
  Game,
  Gold,
  Player,
  PlayerInfo,
  Team,
  TerraNullius,
  Tick,
  UnitInfo,
  UnitType,
} from "../game/Game";
import { GameMap, TileRef } from "../game/GameMap";
import { UserSettings } from "../game/UserSettings";
import { GameConfig, GameID, TeamCountConfig } from "../Schemas";
import { NukeType } from "../StatsSchemas";

export enum GameEnv {
  Dev,
  Preprod,
  Prod,
}

export interface ServerConfig {
  turnstileSiteKey(): string;
  turnIntervalMs(): number;
  gameCreationRate(): number;
  numWorkers(): number;
  workerIndex(gameID: GameID): number;
  workerPath(gameID: GameID): string;
  workerPort(gameID: GameID): number;
  workerPortByIndex(workerID: number): number;
  env(): GameEnv;
  adminToken(): string;
  adminHeader(): string;
  // Only available on the server
  gitCommit(): string;
  apiKey(): string;
  otelEndpoint(): string;
  otelAuthHeader(): string;
  otelEnabled(): boolean;
  jwtAudience(): string;
  jwtIssuer(): string;
  jwkPublicKey(): Promise<JWK>;
  domain(): string;
  subdomain(): string;
  stripePublishableKey(): string;
  allowedFlares(): string[] | undefined;
}

export interface NukeMagnitude {
  inner: number;
  outer: number;
}

export interface Config {
  spawnImmunityDuration(): Tick;
  nationSpawnImmunityDuration(): Tick;
  hasExtendedSpawnImmunity(): boolean;
  serverConfig(): ServerConfig;
  gameConfig(): GameConfig;
  percentageTilesOwnedToWin(): number;
  numBots(): number;
  spawnNations(): boolean;
  isUnitDisabled(unitType: UnitType): boolean;
  bots(): number;
  infiniteGold(): boolean;
  donateGold(): boolean;
  infiniteTroops(): boolean;
  donateTroops(): boolean;
  instantBuild(): boolean;
  disableNavMesh(): boolean;
  disableAlliances(): boolean;
  waterNukes(): boolean;
  isRandomSpawn(): boolean;
  numSpawnPhaseTurns(): number;
  userSettings(): UserSettings;
  playerTeams(): TeamCountConfig;
  goldMultiplier(): number;
  startingGold(playerInfo: PlayerInfo): Gold;

  startManpower(playerInfo: PlayerInfo): number;
  troopIncreaseRate(player: Player): number;
  goldAdditionRate(player: Player): Gold;
  conquerGoldAmount(captured: Player): Gold;
  attackTilesPerTick(
    attckTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    numAdjacentTilesWithEnemy: number,
  ): number;
  attackLogic(
    gm: Game,
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    tileToConquer: TileRef,
  ): {
    attackerTroopLoss: number;
    defenderTroopLoss: number;
    tilesPerTickUsed: number;
  };
  attackAmount(attacker: Player, defender: Player | TerraNullius): number;
  radiusPortSpawn(): number;
  // When computing likelihood of trading for any given port, the X closest port
  // are twice more likely to be selected. X is determined below.
  proximityBonusPortsNb(totalPorts: number): number;
  maxTroops(player: Player): number;
  cityTroopIncrease(): number;
  boatAttackAmount(attacker: Player, defender: Player | TerraNullius): number;
  shellLifetime(): number;
  boatMaxNumber(): number;
  allianceDuration(): Tick;
  allianceRequestDuration(): Tick;
  allianceRequestCooldown(): Tick;
  temporaryEmbargoDuration(): Tick;
  targetDuration(): Tick;
  targetCooldown(): Tick;
  emojiMessageCooldown(): Tick;
  emojiMessageDuration(): Tick;
  donateCooldown(): Tick;
  embargoAllCooldown(): Tick;
  deletionMarkDuration(): Tick;
  deleteUnitCooldown(): Tick;
  defaultDonationAmount(sender: Player): number;
  unitInfo(type: UnitType): UnitInfo;
  tradeShipShortRangeDebuff(): number;
  tradeShipGold(dist: number, player: Player): Gold;
  tradeShipSpawnRate(
    tradeShipSpawnRejections: number,
    numTradeShips: number,
  ): number;
  trainGold(
    rel: "self" | "team" | "ally" | "other",
    citiesVisited: number,
    player: Player,
  ): Gold;
  trainSpawnRate(numPlayerFactories: number): number;
  trainStationMinRange(): number;
  trainStationMaxRange(): number;
  railroadMaxSize(): number;
  safeFromPiratesCooldownMax(): number;
  defensePostRange(): number;
  SAMCooldown(): number;
  SiloCooldown(): number;
  minDistanceBetweenPlayers(): number;
  defensePostDefenseBonus(): number;
  defensePostSpeedBonus(): number;
  falloutDefenseModifier(percentOfFallout: number): number;
  warshipPatrolRange(): number;
  warshipShellAttackRate(): number;
  warshipTargettingRange(): number;
  warshipDockingRange(): number;
  warshipPortHealingBonusPerLevel(): number;
  warshipRetreatHealthThreshold(): number;
  warshipPassiveHealing(): number;
  warshipPassiveHealingRange(): number;
  warshipPortSwitchThreshold(): number;
  defensePostShellAttackRate(): number;
  defensePostTargettingRange(): number;
  // 0-1
  traitorDefenseDebuff(): number;
  traitorDuration(): number;
  nukeMagnitudes(unitType: UnitType): NukeMagnitude;
  // Number of tiles destroyed to break an alliance
  nukeAllianceBreakThreshold(): number;
  defaultNukeSpeed(): number;
  defaultNukeTargetableRange(): number;
  defaultSamMissileSpeed(): number;
  defaultSamRange(): number;
  samRange(level: number): number;
  maxSamRange(): number;
  nukeDeathFactor(
    nukeType: NukeType,
    humans: number,
    tilesOwned: number,
    maxTroops: number,
  ): number;
  structureMinDist(): number;
  isReplay(): boolean;
  allianceExtensionPromptOffset(): number;
}

// Upstream also declares a Theme interface and a Config.theme(): Theme member
// here, plus a dozen Colord-typed color accessors on it (territoryColor,
// borderColor, terrainColor, and so on). Dropped from this vendor build -
// they're pure rendering concerns (the only caller in the reachable core
// closure was GameView.ts, which isn't part of a headless replay) and
// pulled in colord/colorjs.io plus OpenFront's whole PastelTheme palette
// system for zero simulation-relevant benefit.

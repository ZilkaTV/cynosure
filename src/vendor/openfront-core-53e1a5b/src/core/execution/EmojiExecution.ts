// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 53e1a5b03e35c27a3130c1c534f9416b8d6c724f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/53e1a5b03e35c27a3130c1c534f9416b8d6c724f/src/core/execution/EmojiExecution.ts
// Unmodified copy - see src/vendor/openfront-core-53e1a5b/README.md.
import { AllPlayers, Execution, Game, Player, PlayerID } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { flattenedEmojiTable } from "../Util";
import { respondToEmoji } from "./nation/NationEmojiBehavior";

export class EmojiExecution implements Execution {
  private recipient: Player | typeof AllPlayers;

  private mg: Game;
  private random: PseudoRandom;

  private active = true;

  constructor(
    private requestor: Player,
    private recipientID: PlayerID | typeof AllPlayers,
    private emoji: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());

    if (this.recipientID !== AllPlayers && !mg.hasPlayer(this.recipientID)) {
      console.warn(`EmojiExecution: recipient ${this.recipientID} not found`);
      this.active = false;
      return;
    }

    this.recipient =
      this.recipientID === AllPlayers
        ? AllPlayers
        : mg.player(this.recipientID);
  }

  tick(ticks: number): void {
    const emojiString = flattenedEmojiTable[this.emoji];
    if (emojiString === undefined) {
      console.warn(
        `cannot send emoji ${this.emoji} from ${this.requestor} to ${this.recipient}`,
      );
    } else if (this.requestor.canSendEmoji(this.recipient)) {
      this.requestor.sendEmoji(this.recipient, emojiString);
      respondToEmoji(
        this.mg,
        this.random,
        this.requestor,
        this.recipient,
        emojiString,
      );
    } else {
      console.warn(
        `cannot send emoji from ${this.requestor} to ${this.recipient}`,
      );
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

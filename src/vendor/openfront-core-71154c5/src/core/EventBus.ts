// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 71154c52c2a236ab04b08d9b2041f9ea8252a58c.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/71154c52c2a236ab04b08d9b2041f9ea8252a58c/src/core/EventBus.ts
// Unmodified copy - see src/vendor/openfront-core-71154c5/README.md.
export type GameEvent = object;

export interface EventConstructor<T extends GameEvent = GameEvent> {
  new (...args: any[]): T;
}

export class EventBus {
  private listeners: Map<EventConstructor, Array<(event: GameEvent) => void>> =
    new Map();

  emit<T extends GameEvent>(event: T): void {
    const eventConstructor = event.constructor as EventConstructor<T>;
    const callbacks = this.listeners.get(eventConstructor);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(event);
      }
    }
  }

  on<T extends GameEvent>(
    eventType: EventConstructor<T>,
    callback: (event: T) => void,
  ): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    const callbacks = this.listeners.get(eventType)!;
    callbacks.push(callback as (event: GameEvent) => void);
  }

  off<T extends GameEvent>(
    eventType: EventConstructor<T>,
    callback: (event: T) => void,
  ): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback as (event: GameEvent) => void);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
}

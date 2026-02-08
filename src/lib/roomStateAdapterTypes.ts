import type { GameState } from "./types";

export type RoomStateUpdater = (prev: GameState | null) => GameState | null;
export type RoomStateListener = (state: GameState | null) => void;

/**
 * Shared room-state adapter contract.
 *
 * Requirements (all adapters):
 * - Methods are synchronous and return the latest local snapshot immediately.
 * - `save` persists the provided full snapshot and returns it.
 * - `update` performs read-modify-write atomically from the adapter perspective.
 * - `subscribe` notifies when room snapshot changes and returns unsubscribe.
 * - `null` means room does not exist (or was deleted).
 */
export interface RoomStateAdapter {
  /**
   * Read current room snapshot.
   */
  load(roomId: string): GameState | null;
  /**
   * Write full room snapshot.
   */
  save(roomId: string, state: GameState): GameState;
  /**
   * Read-modify-write helper for state transitions.
   */
  update(roomId: string, updater: RoomStateUpdater): GameState | null;
  /**
   * Subscribe to snapshot updates for a room.
   * Returns cleanup function.
   */
  subscribe(roomId: string, listener: RoomStateListener): () => void;
}

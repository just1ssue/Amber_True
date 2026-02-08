import type { GameState } from "./types";

export type RoomStateUpdater = (prev: GameState | null) => GameState | null;
export type RoomStateListener = (state: GameState | null) => void;

export interface RoomStateAdapter {
  load(roomId: string): GameState | null;
  save(roomId: string, state: GameState): GameState;
  update(roomId: string, updater: RoomStateUpdater): GameState | null;
  subscribe(roomId: string, listener: RoomStateListener): () => void;
}

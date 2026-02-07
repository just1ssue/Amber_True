import type { GameState } from "./types";

const KEY_PREFIX = "amber_true_room_state:";

function roomKey(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
}

export type RoomStateUpdater = (prev: GameState | null) => GameState | null;
export type RoomStateListener = (state: GameState | null) => void;

export interface RoomStateAdapter {
  load(roomId: string): GameState | null;
  save(roomId: string, state: GameState): GameState;
  update(roomId: string, updater: RoomStateUpdater): GameState | null;
  subscribe(roomId: string, listener: RoomStateListener): () => void;
}

export const localRoomStateAdapter: RoomStateAdapter = {
  load(roomId) {
    const raw = localStorage.getItem(roomKey(roomId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GameState;
    } catch {
      return null;
    }
  },
  save(roomId, state) {
    localStorage.setItem(roomKey(roomId), JSON.stringify(state));
    return state;
  },
  update(roomId, updater) {
    const prev = localRoomStateAdapter.load(roomId);
    const next = updater(prev);
    if (!next) {
      localStorage.removeItem(roomKey(roomId));
      return null;
    }
    return localRoomStateAdapter.save(roomId, next);
  },
  subscribe(roomId, listener) {
    const key = roomKey(roomId);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      listener(localRoomStateAdapter.load(roomId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
};

export function getRoomStateAdapter(): RoomStateAdapter {
  return localRoomStateAdapter;
}

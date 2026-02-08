import type { GameState } from "./types";
import { createLiveblocksRoomStateAdapter } from "./liveblocksAdapter";
import type { RoomStateAdapter, RoomStateUpdater, RoomStateListener } from "./roomStateAdapterTypes";

const KEY_PREFIX = "amber_true_room_state:";

function roomKey(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
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
  const mode = import.meta.env.VITE_ROOM_ADAPTER ?? "local";
  if (mode === "liveblocks") return createLiveblocksRoomStateAdapter(localRoomStateAdapter);
  return localRoomStateAdapter;
}

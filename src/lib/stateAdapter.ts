import type { GameState } from "./types";

const KEY_PREFIX = "amber_true_room_state:";

function roomKey(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
}

export function loadRoomState(roomId: string): GameState | null {
  const raw = localStorage.getItem(roomKey(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function saveRoomState(roomId: string, state: GameState): GameState {
  localStorage.setItem(roomKey(roomId), JSON.stringify(state));
  return state;
}

export function updateRoomState(
  roomId: string,
  updater: (prev: GameState | null) => GameState | null,
): GameState | null {
  const prev = loadRoomState(roomId);
  const next = updater(prev);
  if (!next) {
    localStorage.removeItem(roomKey(roomId));
    return null;
  }
  return saveRoomState(roomId, next);
}

export function subscribeRoomState(
  roomId: string,
  listener: (state: GameState | null) => void,
): () => void {
  const key = roomKey(roomId);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    listener(loadRoomState(roomId));
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

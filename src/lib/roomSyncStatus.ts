export type RoomSyncMode = "local" | "liveblocks";
export type RoomSyncHealth = "healthy" | "degraded";

export type RoomSyncStatus = {
  roomId: string;
  mode: RoomSyncMode;
  health: RoomSyncHealth;
  reason: string;
  updatedAt: number;
};

type RoomSyncStatusListener = (status: RoomSyncStatus) => void;

const statusMap = new Map<string, RoomSyncStatus>();
const listeners = new Map<string, Set<RoomSyncStatusListener>>();

function defaultStatus(roomId: string): RoomSyncStatus {
  return {
    roomId,
    mode: "local",
    health: "healthy",
    reason: "default_local",
    updatedAt: Date.now(),
  };
}

export function getRoomSyncStatus(roomId: string): RoomSyncStatus {
  return statusMap.get(roomId) ?? defaultStatus(roomId);
}

export function subscribeRoomSyncStatus(roomId: string, listener: RoomSyncStatusListener): () => void {
  const set = listeners.get(roomId) ?? new Set<RoomSyncStatusListener>();
  set.add(listener);
  listeners.set(roomId, set);
  listener(getRoomSyncStatus(roomId));
  return () => {
    const current = listeners.get(roomId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(roomId);
  };
}

export function setRoomSyncStatus(
  roomId: string,
  mode: RoomSyncMode,
  health: RoomSyncHealth,
  reason: string,
) {
  const next: RoomSyncStatus = {
    roomId,
    mode,
    health,
    reason,
    updatedAt: Date.now(),
  };
  statusMap.set(roomId, next);
  const roomListeners = listeners.get(roomId);
  if (!roomListeners) return;
  for (const listener of roomListeners) listener(next);
}

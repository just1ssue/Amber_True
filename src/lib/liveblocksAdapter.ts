import {
  createClient,
  type Client,
  type Room,
} from "@liveblocks/client";
import { setRoomSyncStatus } from "./roomSyncStatus";
import { reportAdapterTelemetry } from "./telemetry";
import type { GameState } from "./types";
import type { RoomStateAdapter, RoomStateListener, RoomStateUpdater } from "./roomStateAdapterTypes";

type LiveblocksSyncMode = "fallback-local" | "liveblocks";
type RoomStorage = {
  gameState?: GameState | null;
};

type LiveblocksConfig = {
  publicKey?: string;
  authEndpoint?: string;
};

type LiveblocksAuthResult =
  | {
      token: string;
    }
  | {
      error: string;
      reason: string;
    };

type LiveblocksRuntime = {
  initialized: boolean;
  mode: LiveblocksSyncMode;
  client: Client | null;
  sessions: Map<string, LiveblocksSession>;
};

type LiveblocksSession = {
  room: Room;
  leave: () => void;
  listeners: Set<RoomStateListener>;
  storageUnsub: (() => void) | null;
  cachedState: GameState | null;
  storageReady: Promise<void>;
};

export function createLiveblocksRoomStateAdapter(fallback: RoomStateAdapter): RoomStateAdapter {
  let warned = false;
  let warnedLoadFailure = false;
  const runtime: LiveblocksRuntime = {
    initialized: false,
    mode: "fallback-local",
    client: null,
    sessions: new Map(),
  };

  function warnFallbackOnce() {
    if (warned) return;
    warned = true;
    console.warn(
      "[Amber_True] Liveblocks adapter fallback to local adapter.",
    );
  }

  function resolveConfig(): LiveblocksConfig {
    return {
      publicKey: import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY,
      authEndpoint: import.meta.env.VITE_LIVEBLOCKS_AUTH_ENDPOINT,
    };
  }

  function createAuthDelegate(endpoint: string) {
    return async (room?: string): Promise<LiveblocksAuthResult> => {
      const roomId = typeof room === "string" ? room : undefined;
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ room }),
          cache: "no-store",
        });
      } catch {
        reportAdapterTelemetry({
          category: "auth",
          code: "auth_endpoint_error",
          reason: "network_error",
          roomId,
        });
        return {
          error: "auth_endpoint_error",
          reason: "network_error",
        };
      }
      if (!response.ok) {
        reportAdapterTelemetry({
          category: "auth",
          code: "auth_endpoint_error",
          reason: `HTTP ${response.status}`,
          roomId,
        });
        return {
          error: "auth_endpoint_error",
          reason: `HTTP ${response.status}`,
        };
      }
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body.token === "string" && body.token.length > 0) {
          return { token: body.token };
        }
        if (typeof body.error === "string") {
          reportAdapterTelemetry({
            category: "auth",
            code: body.error,
            reason: typeof body.reason === "string" ? body.reason : "unknown_reason",
            roomId,
          });
          return {
            error: body.error,
            reason: typeof body.reason === "string" ? body.reason : "unknown_reason",
          };
        }
        reportAdapterTelemetry({
          category: "auth",
          code: "auth_endpoint_error",
          reason: "invalid_auth_response",
          roomId,
        });
        return {
          error: "auth_endpoint_error",
          reason: "invalid_auth_response",
        };
      } catch {
        reportAdapterTelemetry({
          category: "auth",
          code: "auth_endpoint_error",
          reason: "invalid_json_response",
          roomId,
        });
        return {
          error: "auth_endpoint_error",
          reason: "invalid_json_response",
        };
      }
    };
  }

  function initializeRuntime() {
    if (runtime.initialized) return;
    runtime.initialized = true;
    const config = resolveConfig();

    if (!config.publicKey && !config.authEndpoint) {
      runtime.mode = "fallback-local";
      reportAdapterTelemetry({
        category: "sync",
        code: "liveblocks_init_fallback",
        reason: "missing_auth_config",
      });
      warnFallbackOnce();
      return;
    }

    try {
      runtime.client = config.authEndpoint
        ? createClient({ authEndpoint: createAuthDelegate(config.authEndpoint) })
        : createClient({ publicApiKey: config.publicKey as string });
      runtime.mode = "liveblocks";
    } catch {
      runtime.client = null;
      runtime.mode = "fallback-local";
      reportAdapterTelemetry({
        category: "sync",
        code: "liveblocks_init_fallback",
        reason: "create_client_failed",
      });
      warnFallbackOnce();
    }
  }

  function ensureSession(roomId: string): LiveblocksSession | null {
    if (runtime.mode !== "liveblocks" || !runtime.client) return null;
    const existing = runtime.sessions.get(roomId);
    if (existing) return existing;

    const initial = fallback.load(roomId);
    const { room, leave } = runtime.client.enterRoom(roomId, {
      initialPresence: {},
      initialStorage: initial ? ({ gameState: initial } as RoomStorage) : ({} as RoomStorage),
    });

    const session: LiveblocksSession = {
      room,
      leave,
      listeners: new Set(),
      storageUnsub: null,
      cachedState: initial,
      storageReady: Promise.resolve(),
    };

    session.storageReady = room
      .getStorage()
      .then(({ root }) => {
        const fromLiveblocks = root.get("gameState");
        if (fromLiveblocks !== undefined) {
          session.cachedState = (fromLiveblocks as GameState | null) ?? null;
          if (session.cachedState) fallback.save(roomId, session.cachedState);
          return;
        }
        if (initial) {
          room.batch(() => root.set("gameState", initial));
          session.cachedState = initial;
        }
      })
      .catch(() => {
        setRoomSyncStatus(roomId, "liveblocks", "degraded", "storage_read_failed");
        reportAdapterTelemetry({
          category: "sync",
          code: "storage_read_failed",
          reason: "get_storage_failed",
          roomId,
        });
        if (!warnedLoadFailure) {
          warnedLoadFailure = true;
          console.warn("[Amber_True] Failed to read Liveblocks storage. Using local cache.");
        }
      });

    runtime.sessions.set(roomId, session);
    return session;
  }

  function readFromSnapshot(session: LiveblocksSession): GameState | null {
    const snap = session.room.getStorageSnapshot();
    if (!snap) return session.cachedState;
    const fromLiveblocks = snap.get("gameState");
    if (fromLiveblocks === undefined) return session.cachedState;
    return (fromLiveblocks as GameState | null) ?? null;
  }

  function notifyListeners(roomId: string, state: GameState | null) {
    const session = runtime.sessions.get(roomId);
    if (!session) return;
    for (const listener of session.listeners) listener(state);
  }

  function loadFromRoom(roomId: string) {
    const session = ensureSession(roomId);
    if (!session) {
      setRoomSyncStatus(roomId, "local", "degraded", "liveblocks_unavailable");
      return fallback.load(roomId);
    }

    const current = readFromSnapshot(session);
    if (current) {
      session.cachedState = current;
      fallback.save(roomId, current);
      setRoomSyncStatus(roomId, "liveblocks", "healthy", "storage_snapshot_loaded");
      return current;
    }
    setRoomSyncStatus(roomId, "liveblocks", "healthy", "using_local_cache");
    return fallback.load(roomId);
  }

  function saveToRoom(roomId: string, state: GameState) {
    const session = ensureSession(roomId);
    const next = fallback.save(roomId, state);
    if (!session) {
      setRoomSyncStatus(roomId, "local", "degraded", "liveblocks_unavailable");
      return next;
    }

    session.cachedState = next;
    void session.storageReady
      .then(() =>
        session.room.batch(() => {
          const root = session.room.getStorageSnapshot();
          if (!root) return;
          root.set("gameState", next);
          setRoomSyncStatus(roomId, "liveblocks", "healthy", "storage_write_ok");
        }),
      )
      .catch(() => {
        setRoomSyncStatus(roomId, "liveblocks", "degraded", "storage_write_failed");
        reportAdapterTelemetry({
          category: "sync",
          code: "storage_write_failed",
          reason: "save_to_room_failed",
          roomId,
        });
      });
    return next;
  }

  function removeFromRoom(roomId: string) {
    const session = ensureSession(roomId);
    const _ = fallback.update(roomId, () => null);
    if (!session) {
      setRoomSyncStatus(roomId, "local", "degraded", "liveblocks_unavailable");
      return null;
    }

    session.cachedState = null;
    void session.storageReady
      .then(() =>
        session.room.batch(() => {
          const root = session.room.getStorageSnapshot();
          if (!root) return;
          root.delete("gameState");
          setRoomSyncStatus(roomId, "liveblocks", "healthy", "storage_delete_ok");
        }),
      )
      .catch(() => {
        setRoomSyncStatus(roomId, "liveblocks", "degraded", "storage_delete_failed");
        reportAdapterTelemetry({
          category: "sync",
          code: "storage_write_failed",
          reason: "remove_from_room_failed",
          roomId,
        });
      });
    return null;
  }

  function subscribeRoom(roomId: string, listener: RoomStateListener) {
    const session = ensureSession(roomId);
    if (!session) {
      setRoomSyncStatus(roomId, "local", "degraded", "liveblocks_unavailable");
      return fallback.subscribe(roomId, listener);
    }

    session.listeners.add(listener);
    if (!session.storageUnsub) {
      session.storageReady
        .then(() => {
          const root = session.room.getStorageSnapshot();
          if (!root || session.storageUnsub) return;
          session.storageUnsub = session.room.subscribe(
            root,
            () => {
              const next = readFromSnapshot(session);
              session.cachedState = next;
              if (next) fallback.save(roomId, next);
              setRoomSyncStatus(roomId, "liveblocks", "healthy", "storage_subscribe_ok");
              notifyListeners(roomId, next);
            },
            { isDeep: true },
          );
        })
        .catch(() => {
          setRoomSyncStatus(roomId, "liveblocks", "degraded", "storage_subscribe_failed");
          reportAdapterTelemetry({
            category: "sync",
            code: "storage_subscribe_failed",
            reason: "subscribe_room_failed",
            roomId,
          });
        });
    }

    listener(loadFromRoom(roomId));
    return () => {
      session.listeners.delete(listener);
    };
  }

  function applyUpdaterOnLatest(
    roomId: string,
    session: LiveblocksSession,
    updater: RoomStateUpdater,
  ) {
    void session.storageReady
      .then(() =>
        session.room.batch(() => {
          const root = session.room.getStorageSnapshot();
          if (!root) return;
          const latest = (root.get("gameState") as GameState | null | undefined) ?? null;
          const resolved = updater(latest);
          if (!resolved) {
            root.delete("gameState");
            session.cachedState = null;
            fallback.update(roomId, () => null);
            notifyListeners(roomId, null);
            return;
          }
          root.set("gameState", resolved);
          session.cachedState = resolved;
          fallback.save(roomId, resolved);
          setRoomSyncStatus(roomId, "liveblocks", "healthy", "apply_updater_ok");
          notifyListeners(roomId, resolved);
        }),
      )
      .catch(() => {
        setRoomSyncStatus(roomId, "liveblocks", "degraded", "apply_updater_failed");
        reportAdapterTelemetry({
          category: "sync",
          code: "storage_write_failed",
          reason: "apply_updater_failed",
          roomId,
        });
      });
  }

  return {
    load(roomId) {
      initializeRuntime();
      return loadFromRoom(roomId);
    },
    save(roomId, state) {
      initializeRuntime();
      return saveToRoom(roomId, state);
    },
    update(roomId, updater) {
      initializeRuntime();
      const session = ensureSession(roomId);
      if (!session) {
        setRoomSyncStatus(roomId, "local", "degraded", "liveblocks_unavailable");
        return fallback.update(roomId, updater);
      }

      const optimisticPrev = loadFromRoom(roomId);
      const optimisticNext = updater(optimisticPrev);
      if (!optimisticNext) {
        fallback.update(roomId, () => null);
        session.cachedState = null;
        notifyListeners(roomId, null);
      } else {
        fallback.save(roomId, optimisticNext);
        session.cachedState = optimisticNext;
        notifyListeners(roomId, optimisticNext);
      }

      applyUpdaterOnLatest(roomId, session, updater);
      return optimisticNext;
    },
    subscribe(roomId, listener) {
      initializeRuntime();
      return subscribeRoom(roomId, listener);
    },
  };
}

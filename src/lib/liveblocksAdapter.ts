import {
  createClient,
  type Client,
  type Room,
} from "@liveblocks/client";
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
      "[Amber_True] Liveblocks adapter is not wired yet. Falling back to local adapter.",
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
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ room }),
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          error: "auth_endpoint_error",
          reason: `HTTP ${response.status}`,
        };
      }
      try {
        return (await response.json()) as LiveblocksAuthResult;
      } catch {
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
    if (!session) return fallback.load(roomId);

    const current = readFromSnapshot(session);
    if (current) {
      session.cachedState = current;
      fallback.save(roomId, current);
      return current;
    }
    return fallback.load(roomId);
  }

  function saveToRoom(roomId: string, state: GameState) {
    const session = ensureSession(roomId);
    const next = fallback.save(roomId, state);
    if (!session) return next;

    session.cachedState = next;
    void session.storageReady.then(() =>
      session.room.batch(() => {
        const root = session.room.getStorageSnapshot();
        if (!root) return;
        root.set("gameState", next);
      }),
    );
    return next;
  }

  function removeFromRoom(roomId: string) {
    const session = ensureSession(roomId);
    const _ = fallback.update(roomId, () => null);
    if (!session) return null;

    session.cachedState = null;
    void session.storageReady.then(() =>
      session.room.batch(() => {
        const root = session.room.getStorageSnapshot();
        if (!root) return;
        root.delete("gameState");
      }),
    );
    return null;
  }

  function subscribeRoom(roomId: string, listener: RoomStateListener) {
    const session = ensureSession(roomId);
    if (!session) return fallback.subscribe(roomId, listener);

    session.listeners.add(listener);
    if (!session.storageUnsub) {
      session.storageReady.then(() => {
        const root = session.room.getStorageSnapshot();
        if (!root || session.storageUnsub) return;
        session.storageUnsub = session.room.subscribe(
          root,
          () => {
            const next = readFromSnapshot(session);
            session.cachedState = next;
            if (next) fallback.save(roomId, next);
            notifyListeners(roomId, next);
          },
          { isDeep: true },
        );
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
    void session.storageReady.then(() =>
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
        notifyListeners(roomId, resolved);
      }),
    );
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
      if (!session) return fallback.update(roomId, updater);

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

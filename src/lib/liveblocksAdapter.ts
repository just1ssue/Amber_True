import type { RoomStateAdapter } from "./roomStateAdapterTypes";

export function createLiveblocksRoomStateAdapter(fallback: RoomStateAdapter): RoomStateAdapter {
  let warned = false;

  // Placeholder adapter:
  // Liveblocks認証API導入後に、ここを本実装へ差し替える。
  return {
    load(roomId) {
      if (!warned) {
        warned = true;
        console.warn(
          "[Amber_True] Liveblocks adapter is not wired yet. Falling back to local adapter.",
        );
      }
      return fallback.load(roomId);
    },
    save(roomId, state) {
      return fallback.save(roomId, state);
    },
    update(roomId, updater) {
      return fallback.update(roomId, updater);
    },
    subscribe(roomId, listener) {
      return fallback.subscribe(roomId, listener);
    },
  };
}

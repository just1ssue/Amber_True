import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInitialGameState } from "../lib/gameState";
import { loadRoomState, saveRoomState } from "../lib/stateAdapter";
import { getOrCreateDisplayName, getOrCreateUserId, setDisplayName } from "../lib/storage";
import type { PromptsJson } from "../lib/types";

const MAX_MEMBERS = 8;
const ROOM_ID_RETRY = 12;
const RECENT_ROOM_IDS_KEY = "amber_true_recent_room_ids";
const RECENT_ROOM_IDS_LIMIT = 5;

function randomRoomId(): string {
  // モック用: 推測されにくい短めID（本番は長く）
  return crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 12);
}

function generateAvailableRoomId(): string {
  for (let i = 0; i < ROOM_ID_RETRY; i += 1) {
    const id = randomRoomId();
    if (!loadRoomState(id)) return id;
  }
  return randomRoomId();
}

export function Home() {
  const nav = useNavigate();
  const userId = useMemo(() => getOrCreateUserId(), []);
  const [name, setName] = useState(getOrCreateDisplayName());
  const [roomId, setRoomId] = useState("");
  const [prompts, setPrompts] = useState<PromptsJson | null>(null);
  const [joinNotice, setJoinNotice] = useState("");
  const [recentRoomIds, setRecentRoomIds] = useState<string[]>(() => {
    const raw = localStorage.getItem(RECENT_ROOM_IDS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}prompts.json`)
      .then((r) => r.json())
      .then((j) => setPrompts(j))
      .catch(() => setPrompts(null));
  }, []);

  const canJoin = useMemo(() => roomId.trim().length > 0, [roomId]);

  function checkJoinable(nextRoomId: string): { ok: boolean; message: string } {
    const id = nextRoomId.trim();
    if (!id) return { ok: false, message: "" };
    const state = loadRoomState(id);
    if (!state) {
      return { ok: true, message: "このルームは未作成です。参加すると新規ルームとして開始されます。" };
    }
    const memberCount = Object.keys(state.members).length;
    const isJoined = Boolean(state.members[userId]);
    if (!isJoined && memberCount >= MAX_MEMBERS) {
      return { ok: false, message: "このルームは満員です（最大8人）。" };
    }
    return { ok: true, message: `参加可能です（現在 ${memberCount}/${MAX_MEMBERS} 人）。` };
  }

  function handleJoin() {
    const id = roomId.trim();
    const result = checkJoinable(id);
    setJoinNotice(result.message);
    if (!result.ok) return;
    rememberRoomId(id);
    nav(`/room/${id}`);
  }

  function rememberRoomId(id: string) {
    const next = [id, ...recentRoomIds.filter((x) => x !== id)].slice(0, RECENT_ROOM_IDS_LIMIT);
    setRecentRoomIds(next);
    localStorage.setItem(RECENT_ROOM_IDS_KEY, JSON.stringify(next));
  }

  return (
    <div className="card">
      <div className="h1">Amber_True（モック）</div>
      <div className="muted">非ログインで参加できるお題ゲーム。投票は匿名、結果で公開。同率は全員加点。</div>

      <div className="h2">表示名</div>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="表示名"
      />
      <div style={{ marginTop: 8 }}>
        <button
          className="btn"
          onClick={() => setDisplayName(name.trim() || name)}
        >
          保存
        </button>
      </div>

      <div className="h2">ルーム作成</div>
      <button
        className="btn"
        onClick={() => {
          if (!prompts) {
            setJoinNotice("お題データ読み込み中です。少し待ってから作成してください。");
            return;
          }
          const id = generateAvailableRoomId();
          const initial = createInitialGameState(prompts, userId, name);
          saveRoomState(id, initial);
          rememberRoomId(id);
          nav(`/room/${id}`);
        }}
      >
        新しいルームを作成
      </button>

      <div className="h2">ルーム参加</div>
      <div className="row">
        <input
          className="input"
          value={roomId}
          onChange={(e) => {
            const next = e.target.value;
            setRoomId(next);
            const result = checkJoinable(next);
            setJoinNotice(result.message);
          }}
          placeholder="ルームID"
        />
        <button
          className="btn"
          disabled={!canJoin}
          onClick={handleJoin}
        >
          参加
        </button>
      </div>
      {joinNotice && <div className="muted" style={{ marginTop: 8 }}>{joinNotice}</div>}

      <div className="h2">最近のルーム</div>
      {recentRoomIds.length === 0 ? (
        <div className="muted">履歴はまだありません</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {recentRoomIds.map((id) => (
            <button
              key={id}
              className="btn"
              onClick={() => {
                setRoomId(id);
                const result = checkJoinable(id);
                setJoinNotice(result.message);
              }}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      <div className="h2">メモ</div>
      <div className="muted">
        GitHub Pages向けに Hash Router を使用しています。URLは <code>/#/room/&lt;roomId&gt;</code> 形式になります。
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInitialGameState } from "../lib/gameState";
import { fetchPrompts } from "../lib/prompts";
import { getRoomStateAdapter } from "../lib/stateAdapter";
import { getOrCreateDisplayName, getOrCreateUserId, setDisplayName } from "../lib/storage";
import type { PromptsJson } from "../lib/types";

const MAX_MEMBERS = 8;
const DEFAULT_ROUND_LIMIT = 5;
const MIN_ROUND_LIMIT = 1;
const MAX_ROUND_LIMIT = 30;
const ROOM_ID_RETRY = 12;
const RECENT_ROOM_IDS_KEY = "amber_true_recent_room_ids";
const RECENT_ROOM_IDS_LIMIT = 5;

function randomRoomId(): string {
  // モック用: 推測されにくい短めID（本番は長く）
  return crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 12);
}

function generateAvailableRoomId(): string {
  const adapter = getRoomStateAdapter();
  for (let i = 0; i < ROOM_ID_RETRY; i += 1) {
    const id = randomRoomId();
    if (!adapter.load(id)) return id;
  }
  return randomRoomId();
}

export function Home() {
  const nav = useNavigate();
  const adapter = useMemo(() => getRoomStateAdapter(), []);
  const userId = useMemo(() => getOrCreateUserId(), []);
  const [name, setName] = useState(getOrCreateDisplayName());
  const [roomId, setRoomId] = useState("");
  const [prompts, setPrompts] = useState<PromptsJson | null>(null);
  const [isPromptsLoading, setIsPromptsLoading] = useState(true);
  const [promptsError, setPromptsError] = useState("");
  const [joinNotice, setJoinNotice] = useState("");
  const [roundLimitInput, setRoundLimitInput] = useState(String(DEFAULT_ROUND_LIMIT));
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

  async function loadPrompts() {
    setIsPromptsLoading(true);
    setPromptsError("");
    try {
      const next = await fetchPrompts(import.meta.env.BASE_URL);
      setPrompts(next);
    } catch (e) {
      setPrompts(null);
      setPromptsError(e instanceof Error ? e.message : "promptsの読み込みに失敗しました");
    } finally {
      setIsPromptsLoading(false);
    }
  }

  useEffect(() => {
    void loadPrompts();
  }, []);

  const canJoin = useMemo(() => roomId.trim().length > 0, [roomId]);

  function checkJoinable(nextRoomId: string): { ok: boolean; message: string } {
    const id = nextRoomId.trim();
    if (!id) return { ok: false, message: "" };
    const state = adapter.load(id);
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
    <div className="home-layout">
      <section className="card home-hero">
        <div className="h1">Amber_True</div>
        <div className="home-hero__lead">
          ログイン不要で遊べるお題ゲーム。投票時は匿名、結果で公開。同率1位は全員加点。
        </div>
        <div className="home-hero__chips">
          <span className="meta-chip">最大 {MAX_MEMBERS} 人</span>
          <span className="meta-chip">Hash Router</span>
          <span className="meta-chip">Mock First</span>
        </div>
      </section>

      <section className="card home-main">
        <div className="home-block">
          <div className="h2">表示名</div>
          <div className="row">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="表示名"
            />
            <button
              className="btn btn--secondary"
              onClick={() => setDisplayName(name.trim() || name)}
            >
              表示名を保存
            </button>
          </div>
        </div>

        <div className="home-block">
          <div className="h2">ルーム作成</div>
          {isPromptsLoading && <div className="muted">お題データを読み込み中です...</div>}
          {promptsError && (
            <div className="muted">
              {promptsError}
              <div style={{ marginTop: 8 }}>
                <button className="btn btn--secondary" onClick={() => void loadPrompts()}>
                  再読み込み
                </button>
              </div>
            </div>
          )}
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              className="input"
              type="number"
              min={MIN_ROUND_LIMIT}
              max={MAX_ROUND_LIMIT}
              value={roundLimitInput}
              onChange={(e) => setRoundLimitInput(e.target.value)}
              placeholder="ラウンド上限"
            />
          </div>
          <button
            className="btn btn--primary home-main-action"
            disabled={isPromptsLoading || Boolean(promptsError)}
            onClick={() => {
              if (!prompts) {
                setJoinNotice("お題データが未読込です。再読み込み後に作成してください。");
                return;
              }
              const parsedRoundLimit = Number.parseInt(roundLimitInput, 10);
              const roundLimit = Number.isFinite(parsedRoundLimit)
                ? Math.min(MAX_ROUND_LIMIT, Math.max(MIN_ROUND_LIMIT, parsedRoundLimit))
                : DEFAULT_ROUND_LIMIT;
              const id = generateAvailableRoomId();
              const initial = createInitialGameState(prompts, userId, name, roundLimit);
              adapter.save(id, initial);
              rememberRoomId(id);
              nav(`/room/${id}`);
            }}
          >
            新しいルームを作成
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            ラウンド上限: {MIN_ROUND_LIMIT} 〜 {MAX_ROUND_LIMIT}
          </div>
        </div>

        <div className="home-block">
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
              className="btn btn--secondary"
              disabled={!canJoin}
              onClick={handleJoin}
            >
              ルームへ参加
            </button>
          </div>
          {joinNotice && <div className="muted" style={{ marginTop: 8 }}>{joinNotice}</div>}
        </div>
      </section>

      <aside className="card home-side">
        <div className="h2">最近のルーム</div>
        {recentRoomIds.length === 0 ? (
          <div className="muted">履歴はまだありません</div>
        ) : (
          <div className="home-room-history">
            {recentRoomIds.map((id) => (
              <button
                key={id}
                className="btn btn--ghost"
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

        <div className="home-note">
          <div className="h2">接続情報</div>
          <div className="muted">
            URLは <code>/#/room/&lt;roomId&gt;</code> 形式です。
          </div>
        </div>
      </aside>
    </div>
  );
}

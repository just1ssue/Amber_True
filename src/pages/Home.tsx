import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateDisplayName, setDisplayName } from "../lib/storage";

function randomRoomId(): string {
  // モック用: 推測されにくい短めID（本番は長く）
  return crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 12);
}

export function Home() {
  const nav = useNavigate();
  const [name, setName] = useState(getOrCreateDisplayName());
  const [roomId, setRoomId] = useState("");

  const canJoin = useMemo(() => roomId.trim().length > 0, [roomId]);

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
          const id = randomRoomId();
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
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="ルームID"
        />
        <button
          className="btn"
          disabled={!canJoin}
          onClick={() => nav(`/room/${roomId.trim()}`)}
        >
          参加
        </button>
      </div>

      <div className="h2">メモ</div>
      <div className="muted">
        GitHub Pages向けに Hash Router を使用しています。URLは <code>/#/room/&lt;roomId&gt;</code> 形式になります。
      </div>
    </div>
  );
}

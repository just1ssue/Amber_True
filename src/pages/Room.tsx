import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createInitialGameState } from "../lib/gameState";
import { fetchPrompts } from "../lib/prompts";
import { getRoomStateAdapter } from "../lib/stateAdapter";
import type { GameState, PromptsJson } from "../lib/types";
import { buildPrompt } from "../lib/prompt";
import { getOrCreateDisplayName, getOrCreateUserId } from "../lib/storage";

const MAX_MEMBERS = 8;

export function Room() {
  const { roomId = "" } = useParams();
  const adapter = useMemo(() => getRoomStateAdapter(), []);
  const userId = useMemo(() => getOrCreateUserId(), []);
  const name = useMemo(() => getOrCreateDisplayName(), []);

  const [data, setData] = useState<PromptsJson | null>(null);
  const [isPromptsLoading, setIsPromptsLoading] = useState(true);
  const [promptsError, setPromptsError] = useState("");
  const [game, setGame] = useState<GameState | null>(null);
  const [joinError, setJoinError] = useState<string>("");

  const [answerText, setAnswerText] = useState("");

  async function loadPrompts() {
    setIsPromptsLoading(true);
    setPromptsError("");
    try {
      const next = await fetchPrompts(import.meta.env.BASE_URL);
      setData(next);
    } catch (e) {
      setData(null);
      setPromptsError(e instanceof Error ? e.message : "promptsの読み込みに失敗しました");
    } finally {
      setIsPromptsLoading(false);
    }
  }

  useEffect(() => {
    void loadPrompts();
  }, []);

  useEffect(() => {
    if (!data || !roomId) return;
    const unsub = adapter.subscribe(roomId, setGame);
    let isFull = false;
    const now = Date.now();
    const next = adapter.update(roomId, (prev) => {
      if (!prev) {
        return createInitialGameState(data, userId, name, now);
      }
      const isJoined = Boolean(prev.members[userId]);
      if (!isJoined && Object.keys(prev.members).length >= MAX_MEMBERS) {
        isFull = true;
        return prev;
      }
      const activeMemberIds =
        prev.activeMemberIds && prev.activeMemberIds.length > 0
          ? prev.activeMemberIds
          : Object.keys(prev.members);
      return {
        ...prev,
        activeMemberIds,
        members: {
          ...prev.members,
          [userId]: {
            name,
            joinedAt: prev.members[userId]?.joinedAt ?? now,
          },
        },
      };
    });
    setGame(next);
    setJoinError(isFull ? "このルームは満員です（最大8人）。" : "");

    return () => {
      unsub();
      adapter.update(roomId, (prev) => {
        if (!prev || !prev.members[userId]) return prev;
        const members = { ...prev.members };
        delete members[userId];
        const nextMemberIds = Object.keys(members);
        if (nextMemberIds.length === 0) return null;
        const nextActiveMemberIds = prev.activeMemberIds.filter((id) => id !== userId);
        const activeMemberIds =
          nextActiveMemberIds.length > 0 ? nextActiveMemberIds : nextMemberIds;
        const nextHostId = prev.hostId === userId ? nextMemberIds[0] : prev.hostId;
        return {
          ...prev,
          activeMemberIds,
          members,
          hostId: nextHostId,
        };
      });
    };
  }, [adapter, data, name, roomId, userId]);

  if (promptsError) {
    return (
      <div className="card">
        <div className="h1">Room: {roomId}</div>
        <div className="muted">{promptsError}</div>
        <div style={{ marginTop: 8 }}>
          <button className="btn btn--secondary" onClick={() => void loadPrompts()}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="card">
        <div className="h1">Room: {roomId}</div>
        <div className="muted">{joinError || (isPromptsLoading ? "loading..." : "初期化中...")}</div>
      </div>
    );
  }

  const memberIds = Object.keys(game.members);
  const activeMemberIds =
    game.activeMemberIds.length > 0
      ? game.activeMemberIds.filter((id) => Boolean(game.members[id]))
      : memberIds;
  const isHost = game.hostId === userId;
  const isActiveRoundMember = activeMemberIds.includes(userId);
  const mySubmitted = Boolean(game.submissions[userId]);
  const myVoted = Boolean(game.votes[userId]);
  const allSubmitted =
    activeMemberIds.length > 0 && activeMemberIds.every((id) => Boolean(game.submissions[id]));
  const allVoted =
    activeMemberIds.length > 0 && activeMemberIds.every((id) => Boolean(game.votes[id]));
  const mySubmissionText = game.submissions[userId]?.text ?? "";

  function applyGameUpdate(updater: (prev: GameState) => GameState) {
    const next = adapter.update(roomId, (prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
    setGame(next);
  }

  function submitAnswer() {
    const text = answerText.trim();
    if (text.length === 0 || mySubmitted || !isActiveRoundMember) return;
    applyGameUpdate((prev) => ({
      ...prev,
      submissions: {
        ...prev.submissions,
        [userId]: {
          text,
          submittedAt: Date.now(),
        },
      },
    }));
    setAnswerText("");
  }

  function startVoteIfReady() {
    if (!isHost || !allSubmitted) return;
    applyGameUpdate((prev) => ({ ...prev, phase: "VOTE" }));
  }

  function showResult() {
    if (!isHost || !allVoted) return;
    applyGameUpdate((prev) => {
      const tally: Record<string, number> = {};
      for (const v of Object.values(prev.votes)) {
        tally[v.targetUserId] = (tally[v.targetUserId] ?? 0) + 1;
      }
      const max = Math.max(0, ...Object.values(tally));
      const winners = Object.entries(tally)
        .filter(([, n]) => n === max && max > 0)
        .map(([uid]) => uid);
      const nextScores = { ...prev.scores };
      for (const w of winners) nextScores[w] = (nextScores[w] ?? 0) + 1;
      return {
        ...prev,
        phase: "RESULT",
        scores: nextScores,
      };
    });
  }

  function nextRound() {
    if (!isHost || !data) return;
    applyGameUpdate((prev) => ({
      ...prev,
      round: prev.round + 1,
      phase: "ANSWER",
      prompt: buildPrompt(data),
      activeMemberIds: Object.keys(prev.members),
      submissions: {},
      votes: {},
    }));
  }

  function castVote(targetUserId: string) {
    if (myVoted || !isActiveRoundMember) return;
    applyGameUpdate((prev) => ({
      ...prev,
      votes: {
        ...prev.votes,
        [userId]: { targetUserId },
      },
    }));
  }

  return (
    <div className="card">
      <div className="h1">Room: {roomId}</div>
      <div className="meta-grid">
        <div className="meta-chip">
          user: <code>{name}</code>
        </div>
        <div className="meta-chip">
          room member: {memberIds.length}
        </div>
        <div className="meta-chip">
          round member: {activeMemberIds.length}
        </div>
        <div className="meta-chip">
          host: <code>{game.hostId}</code>
        </div>
      </div>
      {joinError && <div className="muted">{joinError}</div>}
      {!isActiveRoundMember && (
        <div className="muted">
          このラウンドは観戦モードです。次ラウンド開始時に参加対象へ入ります。
        </div>
      )}

      <div className="section">
        <div className="h2">参加者</div>
        <div className="list">
          {memberIds.map((id) => (
            <div className="card phase-card" key={id}>
              <div>
                {game.members[id]?.name ?? id} {id === game.hostId ? "(host)" : ""}
              </div>
              <div className="muted">
                {activeMemberIds.includes(id) ? "参加中" : "観戦中"} / 提出:{" "}
                {game.submissions[id] ? "済" : "-"} / 投票: {game.votes[id] ? "済" : "-"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="phase-head">
          <div className="h2">Round {game.round}</div>
          <div className="phase-pill" data-phase={game.phase}>
            {game.phase}
          </div>
        </div>
        <div className="card phase-card">
          <div className="muted">お題</div>
          <div className="prompt">{game.prompt.text}</div>
        </div>
      </div>

      {game.phase === "ANSWER" && (
        <div className="section">
          <div className="muted">回答を入力して送信（モック：ローカルのみ）</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="回答テキスト"
              disabled={mySubmitted}
            />
            <button
              className="btn btn--secondary"
              disabled={mySubmitted || answerText.trim().length === 0 || !isActiveRoundMember}
              onClick={submitAnswer}
            >
              提出
            </button>
            <button className="btn btn--primary" onClick={startVoteIfReady} disabled={!isHost || !allSubmitted}>
              投票へ
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {activeMemberIds.filter((id) => Boolean(game.submissions[id])).length}/{activeMemberIds.length} 人が提出済み
          </div>
          {mySubmitted && (
            <div className="card phase-card" style={{ marginTop: 8 }}>
              <div className="muted">あなたの提出内容</div>
              <div>{mySubmissionText}</div>
            </div>
          )}
        </div>
      )}

      {game.phase === "VOTE" && (
        <div className="section">
          <div className="muted">投票フェーズ：回答者は匿名表示（結果で公開）</div>
          <div className="list" style={{ marginTop: 12 }}>
            {Object.keys(game.submissions).length === 0 && <div className="muted">提出がありません</div>}
            {Object.entries(game.submissions).map(([submitterId, submission]) => (
              <div className="card phase-card" key={submitterId}>
                <div className="muted">回答者: 匿名</div>
                <div>{submission.text}</div>
                <button
                  className="btn btn--secondary"
                  disabled={myVoted || !isActiveRoundMember}
                  onClick={() => castVote(submitterId)}
                >
                  これに投票
                </button>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn--primary" onClick={showResult} disabled={!isHost || !allVoted}>
              結果へ
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {activeMemberIds.filter((id) => Boolean(game.votes[id])).length}/{activeMemberIds.length} 人が投票済み
          </div>
        </div>
      )}

      {game.phase === "RESULT" && (
        <div className="section">
          <div className="muted">結果フェーズ：回答者を公開、同率は全員加点</div>

          <div className="h2">回答一覧（公開）</div>
          <div className="list">
            {Object.entries(game.submissions).map(([submitterId, submission]) => (
              <div className="card phase-card" key={submitterId}>
                <div className="muted">回答者: {game.members[submitterId]?.name ?? "Unknown"}</div>
                <div>{submission.text}</div>
                <div className="muted">score: {game.scores[submitterId] ?? 0}</div>
              </div>
            ))}
          </div>

          <div className="h2">スコア</div>
          {Object.keys(game.scores).length === 0 ? (
            <div className="muted">まだ得点がありません</div>
          ) : (
            <ul className="score-list">
              {Object.entries(game.scores).map(([uid, sc]) => (
                <li key={uid}>
                  <code>{game.members[uid]?.name ?? uid}</code>: {sc}
                </li>
              ))}
            </ul>
          )}

          <button className="btn btn--primary" onClick={nextRound} disabled={!isHost}>
            次のラウンド
          </button>
        </div>
      )}

      <div className="section">
        <div className="h2">TODO（モック→本番）</div>
        <ul className="muted">
          <li>リアルタイム同期（Liveblocks等）に置き換え</li>
          <li>参加者一覧/最大8人制限/全員提出→投票などの進行を実装</li>
          <li>GitHub ActionsでSheets→prompts.jsonの自動生成を実動化</li>
        </ul>
      </div>
    </div>
  );
}

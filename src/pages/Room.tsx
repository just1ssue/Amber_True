import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createInitialGameState } from "../lib/gameState";
import type { GameState, PromptsJson } from "../lib/types";
import { buildPrompt } from "../lib/prompt";
import { getOrCreateDisplayName, getOrCreateUserId } from "../lib/storage";
import { subscribeRoomState, updateRoomState } from "../lib/stateAdapter";

const MAX_MEMBERS = 8;

export function Room() {
  const { roomId = "" } = useParams();
  const userId = useMemo(() => getOrCreateUserId(), []);
  const name = useMemo(() => getOrCreateDisplayName(), []);

  const [data, setData] = useState<PromptsJson | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [joinError, setJoinError] = useState<string>("");

  const [answerText, setAnswerText] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}prompts.json`)
      .then((r) => r.json())
      .then((j) => setData(j));
  }, []);

  useEffect(() => {
    if (!data || !roomId) return;
    const unsub = subscribeRoomState(roomId, setGame);
    let isFull = false;
    const now = Date.now();
    const next = updateRoomState(roomId, (prev) => {
      if (!prev) {
        return createInitialGameState(data, userId, name, now);
      }
      const isJoined = Boolean(prev.members[userId]);
      if (!isJoined && Object.keys(prev.members).length >= MAX_MEMBERS) {
        isFull = true;
        return prev;
      }
      return {
        ...prev,
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
      updateRoomState(roomId, (prev) => {
        if (!prev || !prev.members[userId]) return prev;
        const members = { ...prev.members };
        delete members[userId];
        const nextMemberIds = Object.keys(members);
        if (nextMemberIds.length === 0) return null;
        const nextHostId = prev.hostId === userId ? nextMemberIds[0] : prev.hostId;
        return {
          ...prev,
          members,
          hostId: nextHostId,
        };
      });
    };
  }, [data, name, roomId, userId]);

  if (!game) {
    return (
      <div className="card">
        <div className="h1">Room: {roomId}</div>
        <div className="muted">{joinError || "loading..."}</div>
      </div>
    );
  }

  const memberIds = Object.keys(game.members);
  const isHost = game.hostId === userId;
  const mySubmitted = Boolean(game.submissions[userId]);
  const myVoted = Boolean(game.votes[userId]);
  const allSubmitted = memberIds.length > 0 && memberIds.every((id) => Boolean(game.submissions[id]));
  const allVoted = memberIds.length > 0 && memberIds.every((id) => Boolean(game.votes[id]));

  function applyGameUpdate(updater: (prev: GameState) => GameState) {
    const next = updateRoomState(roomId, (prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
    setGame(next);
  }

  function submitAnswer() {
    const text = answerText.trim();
    if (text.length === 0 || mySubmitted) return;
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
      submissions: {},
      votes: {},
    }));
  }

  function castVote(targetUserId: string) {
    if (myVoted) return;
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
      <div className="muted">
        user: <code>{name}</code> / <code>{userId}</code>（モック）
      </div>

      <div className="h2">Round {game.round}</div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="muted">お題</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{game.prompt.text}</div>
      </div>

      <div className="h2">Phase: {game.phase}</div>
      <div className="muted">
        host: <code>{game.hostId}</code> / members: {memberIds.length}
      </div>
      {joinError && <div className="muted">{joinError}</div>}

      {game.phase === "ANSWER" && (
        <>
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
              className="btn"
              disabled={mySubmitted || answerText.trim().length === 0}
              onClick={submitAnswer}
            >
              提出
            </button>
            <button className="btn" onClick={startVoteIfReady} disabled={!isHost || !allSubmitted}>
              投票へ
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {Object.keys(game.submissions).length}/{memberIds.length} 人が提出済み
          </div>
        </>
      )}

      {game.phase === "VOTE" && (
        <>
          <div className="muted">投票フェーズ：回答者は匿名表示（結果で公開）</div>
          <div style={{ marginTop: 12 }}>
            {Object.keys(game.submissions).length === 0 && <div className="muted">提出がありません</div>}
            {Object.entries(game.submissions).map(([submitterId, submission]) => (
              <div className="card" key={submitterId} style={{ marginBottom: 8 }}>
                <div className="muted">回答者: 匿名</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{submission.text}</div>
                <button
                  className="btn"
                  disabled={myVoted}
                  onClick={() => castVote(submitterId)}
                >
                  これに投票
                </button>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={showResult} disabled={!isHost || !allVoted}>
              結果へ
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {Object.keys(game.votes).length}/{memberIds.length} 人が投票済み
          </div>
        </>
      )}

      {game.phase === "RESULT" && (
        <>
          <div className="muted">結果フェーズ：回答者を公開、同率は全員加点</div>

          <div className="h2">回答一覧（公開）</div>
          {Object.entries(game.submissions).map(([submitterId, submission]) => (
            <div className="card" key={submitterId} style={{ marginBottom: 8 }}>
              <div className="muted">回答者: {game.members[submitterId]?.name ?? "Unknown"}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{submission.text}</div>
              <div className="muted">score: {game.scores[submitterId] ?? 0}</div>
            </div>
          ))}

          <div className="h2">スコア</div>
          {Object.keys(game.scores).length === 0 ? (
            <div className="muted">まだ得点がありません</div>
          ) : (
            <ul>
              {Object.entries(game.scores).map(([uid, sc]) => (
                <li key={uid}>
                  <code>{game.members[uid]?.name ?? uid}</code>: {sc}
                </li>
              ))}
            </ul>
          )}

          <button className="btn" onClick={nextRound} disabled={!isHost}>
            次のラウンド
          </button>
        </>
      )}

      <div className="h2">TODO（モック→本番）</div>
      <ul className="muted">
        <li>リアルタイム同期（Liveblocks等）に置き換え</li>
        <li>参加者一覧/最大8人制限/全員提出→投票などの進行を実装</li>
        <li>GitHub ActionsでSheets→prompts.jsonの自動生成を実動化</li>
      </ul>
    </div>
  );
}

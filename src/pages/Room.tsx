import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createInitialGameState } from "../lib/gameState";
import { fetchPrompts } from "../lib/prompts";
import { getRoomStateAdapter } from "../lib/stateAdapter";
import type { GameState, PromptsJson } from "../lib/types";
import { buildPrompt } from "../lib/prompt";
import { getOrCreateDisplayName, getOrCreateUserId } from "../lib/storage";

const MAX_MEMBERS = 8;
const DEBUG_MEMBER_PREFIX = "__debug_member_";

function isDebugMemberId(userId: string): boolean {
  return userId.startsWith(DEBUG_MEMBER_PREFIX);
}

function debugMemberName(userId: string): string {
  const num = Number(userId.slice(DEBUG_MEMBER_PREFIX.length));
  const idx = Number.isFinite(num) ? num + 1 : 0;
  return `Debug-${String(idx).padStart(2, "0")}`;
}

function buildDebugActiveMemberIds(baseIds: string[]): string[] {
  const normalized = Array.from(new Set(baseIds));
  const out = normalized.slice(0, MAX_MEMBERS);
  let i = 0;
  while (out.length < MAX_MEMBERS) {
    out.push(`${DEBUG_MEMBER_PREFIX}${i}`);
    i += 1;
  }
  return out;
}

function mockSubmissionText(index: number): string {
  return `デバッグ回答 ${index + 1}`;
}

function userInitial(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "?";
  return normalized[0].toUpperCase();
}

function seededRandom(seed: number): () => number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function avatarStyle(seed: string) {
  const rand = seededRandom(hashString(seed));
  const hue = Math.floor(rand() * 360);
  const sat = 38 + Math.floor(rand() * 20);
  const lightTop = 50 + Math.floor(rand() * 10);
  const lightBottom = 34 + Math.floor(rand() * 10);
  return {
    background: `linear-gradient(180deg, hsl(${hue} ${sat}% ${lightTop}%), hsl(${hue} ${sat}% ${lightBottom}%))`,
  };
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toResultState(prev: GameState): GameState {
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
}

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
  const [debugRound, setDebugRound] = useState<number | null>(null);

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

  useEffect(() => {
    if (!game || debugRound === null) return;
    if (game.round !== debugRound) {
      setDebugRound(null);
    }
  }, [debugRound, game]);

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
  const baseActiveMemberIds =
    game.activeMemberIds.length > 0
      ? game.activeMemberIds.filter((id) => Boolean(game.members[id]))
      : memberIds;
  const isDebugRoundEnabled = import.meta.env.DEV && debugRound === game.round;
  const activeMemberIds = isDebugRoundEnabled
    ? buildDebugActiveMemberIds(baseActiveMemberIds)
    : baseActiveMemberIds;
  const debugMemberIds = activeMemberIds.filter((id) => isDebugMemberId(id));
  const memberIdsForView = isDebugRoundEnabled
    ? Array.from(new Set([...memberIds, ...debugMemberIds]))
    : memberIds;
  const isHost = game.hostId === userId;
  const isActiveRoundMember = activeMemberIds.includes(userId);
  const canUseDebugButton = import.meta.env.DEV && isHost && game.phase === "ANSWER";
  const canRerollPrompt = import.meta.env.DEV && isHost && game.phase === "ANSWER" && Boolean(data);
  const mySubmitted = Boolean(game.submissions[userId]);
  const myVoted = Boolean(game.votes[userId]);
  const allSubmitted =
    activeMemberIds.length > 0 && activeMemberIds.every((id) => Boolean(game.submissions[id]));
  const allVoted =
    activeMemberIds.length > 0 && activeMemberIds.every((id) => Boolean(game.votes[id]));
  const mySubmissionText = game.submissions[userId]?.text ?? "";
  const textCard = data?.text.find((x) => x.id === game.prompt.textId);
  const modifierCard = data?.modifier.find((x) => x.id === game.prompt.modifierId);
  const contentCard = data?.content.find((x) => x.id === game.prompt.contentId);
  const hasPromptParts = Boolean(textCard && modifierCard && contentCard);
  const voteSubmissionEntries = (() => {
    const seed = `${roomId}:${game.round}:vote`;
    return Object.keys(game.submissions)
      .sort((a, b) => hashString(`${seed}:${a}`) - hashString(`${seed}:${b}`))
      .map((id) => [id, game.submissions[id]] as const);
  })();

  const getDisplayName = (id: string): string => {
    if (game.members[id]) return game.members[id].name;
    if (isDebugMemberId(id)) return debugMemberName(id);
    return id;
  };

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
    if (!isHost) return;
    if (isDebugRoundEnabled) {
      applyGameUpdate((prev) => {
        if (prev.round !== debugRound) return prev;
        const realIds =
          prev.activeMemberIds.length > 0
            ? prev.activeMemberIds.filter((id) => Boolean(prev.members[id]))
            : Object.keys(prev.members);
        const debugIds = buildDebugActiveMemberIds(realIds);
        const submissions = { ...prev.submissions };
        let generatedIndex = 0;
        for (const id of debugIds) {
          if (!submissions[id]) {
            submissions[id] = {
              text: mockSubmissionText(generatedIndex),
              submittedAt: Date.now(),
            };
            generatedIndex += 1;
          }
        }

        return {
          ...prev,
          phase: "VOTE",
          activeMemberIds: debugIds,
          submissions,
        };
      });
      return;
    }
    if (!allSubmitted) return;
    applyGameUpdate((prev) => ({ ...prev, phase: "VOTE" }));
  }

  function showResult() {
    if (!isHost || !allVoted) return;
    applyGameUpdate((prev) => toResultState(prev));
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
    applyGameUpdate((prev) => {
      const votes = {
        ...prev.votes,
        [userId]: { targetUserId },
      };
      if (isDebugRoundEnabled && prev.phase === "VOTE") {
        const realVoterIds = prev.activeMemberIds.filter((id) => !isDebugMemberId(id));
        const allRealVoted =
          realVoterIds.length > 0 && realVoterIds.every((id) => Boolean(votes[id]));
        if (allRealVoted) {
          return toResultState({ ...prev, votes });
        }
      }
      return {
        ...prev,
        votes,
      };
    });
  }

  function activateDebugRound() {
    if (!game || !canUseDebugButton) return;
    setDebugRound(game.round);
  }

  function rerollPrompt() {
    if (!data || !canRerollPrompt) return;
    applyGameUpdate((prev) => ({
      ...prev,
      prompt: buildPrompt(data),
    }));
  }

  return (
    <div className="room-layout">
      <aside className="card room-sidebar">
        <div className="h1">Room: {roomId}</div>
        <div className="meta-grid">
          <div className="meta-chip">
            user: <code>{name}</code>
          </div>
          <div className="meta-chip">
            room member: {memberIdsForView.length}
          </div>
          <div className="meta-chip">
            round member: {activeMemberIds.length}
          </div>
          <div className="meta-chip">
            host: <code>{game.hostId}</code>
          </div>
        </div>
        {joinError && <div className="muted section">{joinError}</div>}
        {!isActiveRoundMember && (
          <div className="muted section">
            このラウンドは観戦モードです。次ラウンド開始時に参加対象へ入ります。
          </div>
        )}
        <div className="section">
          <div className="h2">参加者</div>
          <div className="list">
            {memberIdsForView.map((id) => (
              <div className="card phase-card member-tile" key={id}>
                <div className="member-tile__head">
                  <span className="member-avatar" style={avatarStyle(id)} aria-hidden="true">
                    {userInitial(getDisplayName(id))}
                  </span>
                  <span className="member-name">{getDisplayName(id)}</span>
                  {id === game.hostId && <span className="member-badge">host</span>}
                </div>
                <div className="muted">
                  {activeMemberIds.includes(id) ? "参加中" : "観戦中"} / 提出:{" "}
                  {game.submissions[id] ? "済" : "-"} / 投票: {game.votes[id] ? "済" : "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="card room-main">
        <div className="phase-head">
          <div className="h2">Round {game.round}</div>
          <div className="phase-pill" data-phase={game.phase}>
            {game.phase}
          </div>
        </div>
        <div className="card phase-card">
          <div className="muted">お題</div>
          <div className="prompt prompt--large">
            {hasPromptParts ? (
              <>
                <span>{textCard?.text}</span>{" "}
                <span className="prompt-modifier">{modifierCard?.text}</span>{" "}
                <span>{contentCard?.text}</span>
              </>
            ) : (
              game.prompt.text
            )}
          </div>
        </div>

        {game.phase === "ANSWER" && (
          <div className="section">
            <div className="muted">回答を入力して送信（モック：ローカルのみ）</div>
            {canUseDebugButton && (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn--ghost" onClick={activateDebugRound}>
                  {isDebugRoundEnabled ? "デバッグ8人: 有効" : "デバッグ8人を有効化"}
                </button>
                <button className="btn btn--ghost" onClick={rerollPrompt} disabled={!canRerollPrompt}>
                  お題をリロール
                </button>
              </div>
            )}
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
              <button
                className="btn btn--primary"
                onClick={startVoteIfReady}
                disabled={!isHost || (!allSubmitted && !isDebugRoundEnabled)}
              >
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
            <div className="list list--answers list--answers-vote" style={{ marginTop: 12 }}>
              {voteSubmissionEntries.length === 0 && <div className="muted">提出がありません</div>}
              {voteSubmissionEntries.map(([submitterId, submission]) => (
                <div className="card phase-card answer-card" key={submitterId}>
                  <div className="muted">回答者: 匿名</div>
                  <div className="answer-card__text">{submission.text}</div>
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
            <div className="list list--answers list--answers-result">
              {Object.entries(game.submissions).map(([submitterId, submission]) => (
                <div className="card phase-card result-card" key={submitterId}>
                  <div className="result-card__author-head">
                    <span
                      className="member-avatar member-avatar--sm"
                      style={avatarStyle(submitterId)}
                      aria-hidden="true"
                    >
                      {userInitial(getDisplayName(submitterId))}
                    </span>
                    <span className="muted">回答者: {getDisplayName(submitterId)}</span>
                  </div>
                  <div className="result-card__text">{submission.text}</div>
                  <div className="muted result-card__score">score: {game.scores[submitterId] ?? 0}</div>
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
                    <code>{getDisplayName(uid)}</code>: {sc}
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
            <li>GitHub ActionsでSQLite→prompts.jsonの自動生成を運用</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

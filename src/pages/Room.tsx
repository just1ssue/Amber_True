import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createInitialGameState } from "../lib/gameState";
import { fetchPrompts } from "../lib/prompts";
import { getRoomSyncStatus, subscribeRoomSyncStatus } from "../lib/roomSyncStatus";
import { getRoomStateAdapter } from "../lib/stateAdapter";
import type { GameState, PromptsJson } from "../lib/types";
import { buildPrompt } from "../lib/prompt";
import { getOrCreateDisplayName, getOrCreateUserId, setDisplayName } from "../lib/storage";
import { areAllSubmitted, areAllVoted, toResultState, toVoteState } from "../lib/roundLogic";
import {
  buildDebugActiveMemberIds,
  debugMemberName,
  isDebugMemberId,
  mockSubmissionText,
} from "../lib/debugTools";

const MAX_MEMBERS = 8;
const DEFAULT_ROUND_LIMIT = 5;
const MIN_ROUND_LIMIT = 1;
const MAX_ROUND_LIMIT = 30;
const LEAVE_GRACE_MS = 1400;
const LEAVE_SWEEP_MS = 1000;
const PENDING_LEAVE_PREFIX = "amber_true_pending_leave:";

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

function removeMemberFromState(prev: GameState, memberId: string): GameState | null {
  if (!prev.members[memberId]) return prev;
  const members = { ...prev.members };
  delete members[memberId];
  const nextMemberIds = Object.keys(members);
  if (nextMemberIds.length === 0) return null;
  const nextActiveMemberIds = prev.activeMemberIds
    .filter((id) => id !== memberId && Boolean(members[id]));
  const activeMemberIds =
    nextActiveMemberIds.length > 0 ? nextActiveMemberIds : nextMemberIds;
  const nextHostId = prev.hostId === memberId ? nextMemberIds[0] : prev.hostId;
  return {
    ...prev,
    activeMemberIds,
    members,
    hostId: nextHostId,
  };
}

function leaveRoom(adapter: ReturnType<typeof getRoomStateAdapter>, roomId: string, userId: string) {
  adapter.update(roomId, (prev) => {
    if (!prev) return prev;
    return removeMemberFromState(prev, userId);
  });
}

function pendingLeaveKey(roomId: string, userId: string): string {
  return `${PENDING_LEAVE_PREFIX}${roomId}:${userId}`;
}

function markPendingLeave(roomId: string, userId: string, delayMs: number) {
  const dueAt = Date.now() + delayMs;
  localStorage.setItem(pendingLeaveKey(roomId, userId), JSON.stringify({ dueAt }));
}

function clearPendingLeave(roomId: string, userId: string) {
  localStorage.removeItem(pendingLeaveKey(roomId, userId));
}

function sweepPendingLeaves(
  adapter: ReturnType<typeof getRoomStateAdapter>,
  roomId: string,
  now: number = Date.now(),
) {
  const roomPrefix = `${PENDING_LEAVE_PREFIX}${roomId}:`;
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(roomPrefix)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.removeItem(key);
      continue;
    }
    let dueAt = 0;
    try {
      const parsed = JSON.parse(raw) as { dueAt?: number };
      dueAt = typeof parsed.dueAt === "number" ? parsed.dueAt : 0;
    } catch {
      localStorage.removeItem(key);
      continue;
    }
    if (dueAt > now) continue;
    const targetUserId = key.slice(roomPrefix.length);
    localStorage.removeItem(key);
    leaveRoom(adapter, roomId, targetUserId);
  }
}

function kickMember(
  adapter: ReturnType<typeof getRoomStateAdapter>,
  roomId: string,
  hostId: string,
  targetUserId: string,
) {
  adapter.update(roomId, (prev) => {
    if (!prev) return prev;
    if (prev.hostId !== hostId) return prev;
    if (hostId === targetUserId) return prev;
    return removeMemberFromState(prev, targetUserId);
  });
}

export function Room() {
  const { roomId = "" } = useParams();
  const adapter = useMemo(() => getRoomStateAdapter(), []);
  const userId = useMemo(() => getOrCreateUserId(), []);
  const initialDisplayName = useMemo(() => getOrCreateDisplayName(), []);

  const [data, setData] = useState<PromptsJson | null>(null);
  const [isPromptsLoading, setIsPromptsLoading] = useState(true);
  const [promptsError, setPromptsError] = useState("");
  const [game, setGame] = useState<GameState | null>(null);
  const [joinError, setJoinError] = useState<string>("");
  const [debugRound, setDebugRound] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState(() => getRoomSyncStatus(roomId));
  const [displayNameInput, setDisplayNameInput] = useState(initialDisplayName);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [displayNameNotice, setDisplayNameNotice] = useState("");
  const [roundLimitInput, setRoundLimitInput] = useState(String(DEFAULT_ROUND_LIMIT));
  const [roundLimitNotice, setRoundLimitNotice] = useState("");

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
    clearPendingLeave(roomId, userId);
    sweepPendingLeaves(adapter, roomId);
    const unsub = adapter.subscribe(roomId, setGame);
    const handlePageLeave = () => markPendingLeave(roomId, userId, LEAVE_GRACE_MS);
    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);
    const sweepTimer = window.setInterval(() => {
      clearPendingLeave(roomId, userId);
      sweepPendingLeaves(adapter, roomId);
    }, LEAVE_SWEEP_MS);
    let isFull = false;
    const now = Date.now();
    const next = adapter.update(roomId, (prev) => {
      if (!prev) {
        return createInitialGameState(data, userId, initialDisplayName, DEFAULT_ROUND_LIMIT, now);
      }
      const isJoined = Boolean(prev.members[userId]);
      if (!isJoined && Object.keys(prev.members).length >= MAX_MEMBERS) {
        isFull = true;
        return prev;
      }
      const baseActiveMemberIds =
        prev.activeMemberIds && prev.activeMemberIds.length > 0
          ? prev.activeMemberIds.filter((id) => Boolean(prev.members[id]))
          : Object.keys(prev.members);
      const activeMemberIds =
        prev.phase === "ANSWER" && !baseActiveMemberIds.includes(userId)
          ? [...baseActiveMemberIds, userId]
          : baseActiveMemberIds;
      return {
        ...prev,
        roundLimit: prev.roundLimit ?? DEFAULT_ROUND_LIMIT,
        activeMemberIds,
        members: {
          ...prev.members,
          [userId]: {
            name: prev.members[userId]?.name ?? initialDisplayName,
            joinedAt: prev.members[userId]?.joinedAt ?? now,
          },
        },
      };
    });
    setGame(next);
    setJoinError(isFull ? "このルームは満員です（最大8人）。" : "");

    return () => {
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      window.clearInterval(sweepTimer);
      unsub();
      markPendingLeave(roomId, userId, LEAVE_GRACE_MS);
    };
  }, [adapter, data, initialDisplayName, roomId, userId]);

  useEffect(() => {
    if (!roomId) return;
    return subscribeRoomSyncStatus(roomId, setSyncStatus);
  }, [roomId]);

  useEffect(() => {
    if (!game) return;
    setRoundLimitInput(String(game.roundLimit ?? DEFAULT_ROUND_LIMIT));
  }, [game?.roundLimit]);

  useEffect(() => {
    if (!game || debugRound === null) return;
    if (game.round !== debugRound) {
      setDebugRound(null);
    }
  }, [debugRound, game]);

  if (promptsError) {
    return (
      <div className="card">
        <div className="h1">ルームID: {roomId}</div>
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
        <div className="h1">ルームID: {roomId}</div>
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
    ? buildDebugActiveMemberIds(baseActiveMemberIds, MAX_MEMBERS)
    : baseActiveMemberIds;
  const debugMemberIds = activeMemberIds.filter((id) => isDebugMemberId(id));
  const memberIdsForView = isDebugRoundEnabled
    ? Array.from(new Set([...memberIds, ...debugMemberIds]))
    : memberIds;
  const isHost = game.hostId === userId;
  const isActiveRoundMember = activeMemberIds.includes(userId);
  const effectiveRoundLimit = game.roundLimit ?? DEFAULT_ROUND_LIMIT;
  const myDisplayName = game.members[userId]?.name ?? initialDisplayName;
  const canUseDebugButton = import.meta.env.DEV && isHost && game.phase === "ANSWER";
  const canRerollPrompt = import.meta.env.DEV && isHost && game.phase === "ANSWER" && Boolean(data);
  const isLastRound = game.round >= effectiveRoundLimit;
  const mySubmitted = Boolean(game.submissions[userId]);
  const myVoted = Boolean(game.votes[userId]);
  const allSubmitted = areAllSubmitted(game, activeMemberIds);
  const allVoted = areAllVoted(game, activeMemberIds);
  const submittedCount = activeMemberIds.filter((id) => Boolean(game.submissions[id])).length;
  const votedCount = activeMemberIds.filter((id) => Boolean(game.votes[id])).length;
  const phaseOrder: Array<GameState["phase"]> = ["ANSWER", "VOTE", "RESULT", "FINAL_RESULT"];
  const currentPhaseIndex = phaseOrder.indexOf(game.phase);
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
  const voteCountBySubmitter = (() => {
    const tally: Record<string, number> = {};
    for (const submitterId of Object.keys(game.submissions)) tally[submitterId] = 0;
    for (const vote of Object.values(game.votes)) {
      if (tally[vote.targetUserId] === undefined) continue;
      tally[vote.targetUserId] += 1;
    }
    return tally;
  })();
  const roundBottomIds = (() => {
    const submitterIds = Object.keys(game.submissions);
    if (submitterIds.length === 0) return [] as string[];
    const maxVotes = Math.max(...submitterIds.map((id) => voteCountBySubmitter[id] ?? 0));
    return submitterIds.filter((id) => (voteCountBySubmitter[id] ?? 0) === maxVotes);
  })();
  const overallScoreIds = Array.from(new Set([...Object.keys(game.members), ...Object.keys(game.scores)]));
  const overallBottomIds = (() => {
    if (overallScoreIds.length === 0) return [] as string[];
    const minScore = Math.min(...overallScoreIds.map((id) => game.scores[id] ?? 0));
    return overallScoreIds.filter((id) => (game.scores[id] ?? 0) === minScore);
  })();
  const finalRankingRows = (() => {
    const sortedIds = overallScoreIds
      .slice()
      .sort((a, b) => (game.scores[a] ?? 0) - (game.scores[b] ?? 0));
    const rows: Array<{ userId: string; rank: number; isTied: boolean }> = [];
    let lastScore: number | null = null;
    let lastRank = 0;
    let tiedGroupSize = 0;
    for (let i = 0; i < sortedIds.length; i += 1) {
      const userId = sortedIds[i];
      const score = game.scores[userId] ?? 0;
      if (lastScore !== null && score === lastScore) {
        rows.push({ userId, rank: lastRank, isTied: true });
        tiedGroupSize += 1;
      } else {
        if (tiedGroupSize > 1) {
          for (let j = rows.length - tiedGroupSize; j < rows.length; j += 1) {
            rows[j] = { ...rows[j], isTied: true };
          }
        }
        const rank = i + 1;
        rows.push({ userId, rank, isTied: false });
        lastScore = score;
        lastRank = rank;
        tiedGroupSize = 1;
      }
    }
    if (tiedGroupSize > 1) {
      for (let j = rows.length - tiedGroupSize; j < rows.length; j += 1) {
        rows[j] = { ...rows[j], isTied: true };
      }
    }
    return rows;
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
        const debugIds = buildDebugActiveMemberIds(realIds, MAX_MEMBERS);
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
    applyGameUpdate((prev) => toVoteState(prev));
  }

  function showResult() {
    if (!isHost || !allVoted) return;
    applyGameUpdate((prev) => toResultState(prev));
  }

  function nextRound() {
    if (!isHost || !data) return;
    applyGameUpdate((prev) => {
      const roundLimit = prev.roundLimit ?? DEFAULT_ROUND_LIMIT;
      if (prev.round >= roundLimit) {
        return {
          ...prev,
          phase: "FINAL_RESULT",
        };
      }
      return {
        ...prev,
        round: prev.round + 1,
        phase: "ANSWER",
        prompt: buildPrompt(data),
        activeMemberIds: Object.keys(prev.members),
        submissions: {},
        votes: {},
      };
    });
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

  function retrySync() {
    adapter.load(roomId);
  }

  function handleKick(targetUserId: string) {
    if (!game) return;
    if (!isHost || targetUserId === userId || !game.members[targetUserId]) return;
    const targetName = game.members[targetUserId].name;
    if (!window.confirm(`${targetName} をルームから退出させますか？`)) return;
    kickMember(adapter, roomId, userId, targetUserId);
  }

  function updateDisplayName() {
    const nextName = displayNameInput.trim();
    if (!nextName) {
      setDisplayNameNotice("表示名を入力してください。");
      return;
    }
    setDisplayName(nextName);
    applyGameUpdate((prev) => {
      const current = prev.members[userId];
      if (!current) return prev;
      return {
        ...prev,
        members: {
          ...prev.members,
          [userId]: {
            ...current,
            name: nextName,
          },
        },
      };
    });
    setDisplayNameInput(nextName);
    setDisplayNameNotice("表示名を更新しました。");
    setIsEditingDisplayName(false);
  }

  function updateRoundLimit() {
    if (!isHost) return;
    const parsed = Number.parseInt(roundLimitInput, 10);
    if (!Number.isFinite(parsed)) {
      setRoundLimitNotice("ラウンド上限は数値で入力してください。");
      return;
    }
    const currentRound = game?.round ?? 1;
    const minAllowed = game?.phase === "FINAL_RESULT" ? MIN_ROUND_LIMIT : currentRound;
    const clamped = Math.min(MAX_ROUND_LIMIT, Math.max(minAllowed, parsed));
    if (clamped !== parsed) {
      setRoundLimitNotice(`現在は ${minAllowed} 〜 ${MAX_ROUND_LIMIT} の範囲で設定できます。`);
    } else {
      setRoundLimitNotice("ラウンド上限を更新しました。");
    }
    applyGameUpdate((prev) => ({
      ...prev,
      roundLimit: clamped,
    }));
    setRoundLimitInput(String(clamped));
  }

  function restartFromRoundOne() {
    if (!isHost || !data) return;
    setDebugRound(null);
    applyGameUpdate((prev) => {
      const cleanedMembers = Object.fromEntries(
        Object.entries(prev.members).filter(([id]) => !isDebugMemberId(id)),
      );
      const nextHostId = cleanedMembers[prev.hostId] ? prev.hostId : Object.keys(cleanedMembers)[0] ?? prev.hostId;
      return {
        ...prev,
        phase: "ANSWER",
        round: 1,
        prompt: buildPrompt(data),
        members: cleanedMembers,
        hostId: nextHostId,
        activeMemberIds: Object.keys(cleanedMembers),
        submissions: {},
        votes: {},
        scores: {},
      };
    });
  }

  return (
    <div className="room-layout">
      <aside className="card room-sidebar">
        <div className="h1">ルームID: {roomId}</div>
        <div className="meta-grid">
          <div className="meta-chip">
            あなた: <code>{myDisplayName}</code>
          </div>
          <div className="room-name-editor">
            <button
              className="btn btn--secondary room-name-editor__trigger"
              onClick={() => {
                setDisplayNameInput(myDisplayName);
                setDisplayNameNotice("");
                setIsEditingDisplayName(true);
              }}
            >
              名前を変更
            </button>
            {isEditingDisplayName && (
              <div className="row room-name-editor__form">
                <input
                  className="input"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="表示名"
                />
                <button className="btn btn--primary" onClick={updateDisplayName}>
                  保存
                </button>
                <button className="btn btn--ghost" onClick={() => setIsEditingDisplayName(false)}>
                  キャンセル
                </button>
              </div>
            )}
            {displayNameNotice && <div className="muted room-name-editor__notice">{displayNameNotice}</div>}
          </div>
          <div className="meta-chip">
            参加者: {memberIdsForView.length}
          </div>
          <div className="meta-chip">
            ラウンド対象: {activeMemberIds.length}
          </div>
          <div className="meta-chip">
            ホスト: <code>{game.hostId}</code>
          </div>
          <div className="meta-chip">
            ラウンド: {game.round}/{effectiveRoundLimit}
          </div>
        </div>
        {joinError && <div className="muted section">{joinError}</div>}
        {syncStatus.health === "degraded" && (
          <div className="section">
            <div className="muted">
              同期状態: 劣化モード（{syncStatus.mode}）
            </div>
            <div className="muted">reason: {syncStatus.reason}</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn--ghost" onClick={retrySync}>
                再同期を試す
              </button>
            </div>
          </div>
        )}
        {syncStatus.health === "healthy" && syncStatus.mode === "liveblocks" && (
          <div className="muted section">同期状態: Liveblocks 接続中</div>
        )}
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
                  {id === game.hostId && <span className="member-badge">HOST</span>}
                </div>
                <div className="muted">
                  {activeMemberIds.includes(id) ? "参加中" : "観戦中"} / 提出:{" "}
                  {game.submissions[id] ? "済" : "-"} / 投票: {game.votes[id] ? "済" : "-"}
                </div>
                {isHost && id !== userId && Boolean(game.members[id]) && (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn btn--ghost" onClick={() => handleKick(id)}>
                      退出させる
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="section room-sidebar__footer">
          <div className="h2">ラウンド上限</div>
          {isHost ? (
            <>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min={game.phase === "FINAL_RESULT" ? MIN_ROUND_LIMIT : game.round}
                  max={MAX_ROUND_LIMIT}
                  value={roundLimitInput}
                  onChange={(e) => setRoundLimitInput(e.target.value)}
                  placeholder="ラウンド上限"
                />
                <button className="btn btn--secondary" onClick={updateRoundLimit}>
                  変更
                </button>
              </div>
              {roundLimitNotice && <div className="muted" style={{ marginTop: 8 }}>{roundLimitNotice}</div>}
            </>
          ) : (
            <div className="muted">ホスト設定: {effectiveRoundLimit} ラウンド</div>
          )}
        </div>
      </aside>

      <main className="card room-main">
        <div className="phase-head">
          <div className="h2">Round {game.round}</div>
          <div className="phase-pill" data-phase={game.phase}>
            {game.phase}
          </div>
        </div>
        <div className="phase-track">
          {phaseOrder.map((phase, index) => (
            <div
              key={phase}
              className="phase-step"
              data-state={
                index < currentPhaseIndex ? "done" : index === currentPhaseIndex ? "active" : "todo"
              }
            >
              <span className="phase-step__dot" />
              <span>{phase}</span>
            </div>
          ))}
        </div>
        <div className="phase-stats muted">
          {game.phase === "ANSWER" && (
            <span>提出進捗: {submittedCount}/{activeMemberIds.length}（未提出 {activeMemberIds.length - submittedCount}）</span>
          )}
          {game.phase === "VOTE" && (
            <span>ダサ投票進捗: {votedCount}/{activeMemberIds.length}（未投票 {activeMemberIds.length - votedCount}）</span>
          )}
          {game.phase === "RESULT" && <span>結果確認中: 次ラウンドの開始を待っています</span>}
          {game.phase === "FINAL_RESULT" && <span>総合リザルト: 次のゲームを開始できます</span>}
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
            <div className="row action-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="回答テキスト"
                disabled={mySubmitted}
              />
              <button
                className="btn btn--primary action-main"
                disabled={mySubmitted || answerText.trim().length === 0 || !isActiveRoundMember}
                onClick={submitAnswer}
              >
                提出
              </button>
              <button
                className={`btn ${allSubmitted || isDebugRoundEnabled ? "btn--primary" : "btn--secondary"}`}
                onClick={startVoteIfReady}
                disabled={!isHost || (!allSubmitted && !isDebugRoundEnabled)}
              >
                投票へ
              </button>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              {submittedCount}/{activeMemberIds.length} 人が提出済み
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
            <div className="muted">投票フェーズ：この中で一番ダサい回答に投票（回答者は匿名）</div>
            <div className="list list--answers list--answers-vote" style={{ marginTop: 12 }}>
              {voteSubmissionEntries.length === 0 && <div className="muted">提出がありません</div>}
              {voteSubmissionEntries.map(([submitterId, submission]) => (
                <div className="card phase-card answer-card" key={submitterId}>
                  <div className="muted">回答者: 匿名</div>
                  <div className="answer-card__text">{submission.text}</div>
                  <button
                    className="btn btn--secondary vote-button"
                    disabled={myVoted || !isActiveRoundMember}
                    onClick={() => castVote(submitterId)}
                  >
                    ダサい！
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
              {votedCount}/{activeMemberIds.length} 人が投票済み
            </div>
          </div>
        )}

        {game.phase === "RESULT" && (
          <div className="section">
            <div className="muted">結果フェーズ：最少得票の回答者に -1 点。</div>

            <div className="h2">回答一覧（公開）</div>
            <div className="list list--answers list--answers-result">
              {Object.entries(game.submissions).map(([submitterId, submission]) => (
                <div
                  className={[
                    "card",
                    "phase-card",
                    "result-card",
                    roundBottomIds.includes(submitterId) ? "result-card--round-bottom" : "",
                    overallBottomIds.includes(submitterId) ? "result-card--overall-bottom" : "",
                  ].join(" ").trim()}
                  key={submitterId}
                >
                  <div className="result-card__author-head">
                    <span
                      className="member-avatar member-avatar--sm"
                      style={avatarStyle(submitterId)}
                      aria-hidden="true"
                    >
                      {userInitial(getDisplayName(submitterId))}
                    </span>
                    <span className="muted result-card__author-name">回答者: {getDisplayName(submitterId)}</span>
                    <span className="result-card__badge-row">
                      {roundBottomIds.includes(submitterId) && (
                        <span className="result-badge result-badge--round-bottom">ダサい</span>
                      )}
                      {overallBottomIds.includes(submitterId) && (
                        <span className="result-badge result-badge--overall-bottom">一番ダサい</span>
                      )}
                    </span>
                  </div>
                  <div className="result-card__text">{submission.text}</div>
                  <div className="muted result-card__score">
                    このラウンドの得票: {voteCountBySubmitter[submitterId] ?? 0} / score: {game.scores[submitterId] ?? 0}
                  </div>
                </div>
              ))}
            </div>

            <div className="h2">スコア</div>
            {overallScoreIds.length === 0 ? (
              <div className="muted">まだ得点がありません</div>
            ) : (
              <ul className="score-list">
                {overallScoreIds.map((uid) => (
                  <li
                    key={uid}
                    className={overallBottomIds.includes(uid) ? "score-list__item score-list__item--bottom" : "score-list__item"}
                  >
                    <code>{getDisplayName(uid)}</code>: {game.scores[uid] ?? 0}
                    {overallBottomIds.includes(uid) && (
                      <span className="result-badge result-badge--overall-bottom">一番ダサい</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button className="btn btn--primary" onClick={nextRound} disabled={!isHost}>
              {isLastRound ? "総合リザルトへ" : "次のラウンド"}
            </button>
          </div>
        )}

        {game.phase === "FINAL_RESULT" && (
          <div className="section">
            <div className="muted">総合リザルト：全ラウンド終了。</div>
            <div className="h2">最終順位（ダサい順）</div>
            {overallScoreIds.length === 0 ? (
              <div className="muted">まだ得点がありません</div>
            ) : (
              <div className="list list--answers list--answers-result">
                {finalRankingRows.map(({ userId, rank, isTied }) => (
                    <div
                      className={[
                        "card",
                        "phase-card",
                        "result-card",
                        overallBottomIds.includes(userId) ? "result-card--overall-bottom" : "",
                      ].join(" ").trim()}
                      key={userId}
                    >
                      <div className="result-card__author-head">
                        <span
                          className="member-avatar member-avatar--sm"
                          style={avatarStyle(userId)}
                          aria-hidden="true"
                        >
                          {userInitial(getDisplayName(userId))}
                        </span>
                        <span className="muted result-card__author-name">
                          {isTied ? `${rank}位タイ` : `${rank}位`}: {getDisplayName(userId)}
                        </span>
                        <span className="result-card__badge-row">
                          {overallBottomIds.includes(userId) && (
                            <span className="result-badge result-badge--overall-bottom">一番ダサい！</span>
                          )}
                        </span>
                      </div>
                      <div className="muted result-card__score">score: {game.scores[userId] ?? 0}</div>
                    </div>
                  ))}
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn--primary" onClick={restartFromRoundOne} disabled={!isHost}>
                次の部屋へ
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

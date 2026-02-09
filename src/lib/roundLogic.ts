import type { GameState } from "./types";

export function areAllSubmitted(state: GameState, participantIds: string[]): boolean {
  return participantIds.length > 0 && participantIds.every((id) => Boolean(state.submissions[id]));
}

export function areAllVoted(state: GameState, participantIds: string[]): boolean {
  return participantIds.length > 0 && participantIds.every((id) => Boolean(state.votes[id]));
}

export function toVoteState(state: GameState): GameState {
  return {
    ...state,
    phase: "VOTE",
  };
}

export function toResultState(state: GameState): GameState {
  const submittedIds = Object.keys(state.submissions);
  if (submittedIds.length === 0) {
    return {
      ...state,
      phase: "RESULT",
    };
  }

  const tally: Record<string, number> = {};
  for (const submitterId of submittedIds) {
    tally[submitterId] = 0;
  }
  for (const v of Object.values(state.votes)) {
    if (tally[v.targetUserId] === undefined) continue;
    tally[v.targetUserId] = (tally[v.targetUserId] ?? 0) + 1;
  }
  const min = Math.min(...Object.values(tally));
  const losers = Object.entries(tally)
    .filter(([, n]) => n === min)
    .map(([uid]) => uid);
  const nextScores = { ...state.scores };
  for (const loserId of losers) nextScores[loserId] = (nextScores[loserId] ?? 0) - 1;
  return {
    ...state,
    phase: "RESULT",
    scores: nextScores,
  };
}

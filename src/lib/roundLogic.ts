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
  const tally: Record<string, number> = {};
  for (const v of Object.values(state.votes)) {
    tally[v.targetUserId] = (tally[v.targetUserId] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  const winners = Object.entries(tally)
    .filter(([, n]) => n === max && max > 0)
    .map(([uid]) => uid);
  const nextScores = { ...state.scores };
  for (const w of winners) nextScores[w] = (nextScores[w] ?? 0) + 1;
  return {
    ...state,
    phase: "RESULT",
    scores: nextScores,
  };
}

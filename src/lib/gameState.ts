import { buildPrompt } from "./prompt";
import type { GameState, PromptsJson } from "./types";

export function createInitialGameState(
  data: PromptsJson,
  hostId: string,
  hostName: string,
  roundLimit: number,
  now: number = Date.now(),
): GameState {
  return {
    phase: "ANSWER",
    round: 1,
    roundLimit,
    prompt: buildPrompt(data),
    activeMemberIds: [hostId],
    submissions: {},
    votes: {},
    scores: {},
    members: {
      [hostId]: {
        name: hostName,
        joinedAt: now,
      },
    },
    hostId,
  };
}

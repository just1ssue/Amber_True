import { buildPrompt } from "./prompt";
import type { GameState, PromptsJson } from "./types";

export function createInitialGameState(
  data: PromptsJson,
  hostId: string,
  hostName: string,
  now: number = Date.now(),
): GameState {
  return {
    phase: "ANSWER",
    round: 1,
    prompt: buildPrompt(data),
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

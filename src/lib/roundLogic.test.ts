import { describe, expect, it } from "vitest";
import { areAllSubmitted, areAllVoted, toResultState, toVoteState } from "./roundLogic";
import type { GameState } from "./types";

function createState(): GameState {
  return {
    phase: "ANSWER",
    round: 1,
    prompt: {
      textId: "t_001",
      modifierId: "m_001",
      contentId: "c_001",
      text: "test prompt",
    },
    activeMemberIds: ["u1", "u2", "u3"],
    submissions: {
      u1: { text: "a1", submittedAt: 1 },
      u2: { text: "a2", submittedAt: 2 },
      u3: { text: "a3", submittedAt: 3 },
    },
    votes: {},
    scores: {
      u1: 1,
    },
    members: {
      u1: { name: "A", joinedAt: 1 },
      u2: { name: "B", joinedAt: 1 },
      u3: { name: "C", joinedAt: 1 },
    },
    hostId: "u1",
  };
}

describe("round transitions", () => {
  it("transitions ANSWER -> VOTE when all active members submitted", () => {
    const state = createState();
    expect(areAllSubmitted(state, state.activeMemberIds)).toBe(true);

    const next = toVoteState(state);
    expect(next.phase).toBe("VOTE");
  });

  it("transitions VOTE -> RESULT and scores tied winners", () => {
    const voteState: GameState = {
      ...toVoteState(createState()),
      votes: {
        u1: { targetUserId: "u2" },
        u2: { targetUserId: "u3" },
        u3: { targetUserId: "u2" },
      },
    };
    expect(areAllVoted(voteState, voteState.activeMemberIds)).toBe(true);

    const result = toResultState(voteState);
    expect(result.phase).toBe("RESULT");
    expect(result.scores.u2).toBe(1);
    expect(result.scores.u1).toBe(1);
  });

  it("awards all top answers on tie", () => {
    const voteState: GameState = {
      ...toVoteState(createState()),
      votes: {
        u1: { targetUserId: "u1" },
        u2: { targetUserId: "u2" },
        u3: { targetUserId: "u3" },
      },
      scores: {},
    };
    const result = toResultState(voteState);

    expect(result.scores.u1).toBe(1);
    expect(result.scores.u2).toBe(1);
    expect(result.scores.u3).toBe(1);
  });
});

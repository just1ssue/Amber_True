export type PromptCategory = "text" | "modifier" | "content";

export type PromptCard = {
  id: string;
  text: string;
  weight?: number;
};

export type PromptsJson = {
  version: string;
  text: PromptCard[];
  modifier: PromptCard[];
  content: PromptCard[];
};

export type Phase = "ANSWER" | "VOTE" | "RESULT" | "FINAL_RESULT";

export type Prompt = {
  textId: string;
  modifierId: string;
  contentId: string;
  text: string;
};

export type Submission = {
  text: string;
  submittedAt: number;
};

export type Vote = {
  targetUserId: string;
};

export type Member = {
  name: string;
  joinedAt: number;
};

export type GameState = {
  phase: Phase;
  round: number;
  roundLimit: number;
  prompt: Prompt;
  activeMemberIds: string[];
  submissions: Record<string, Submission>;
  votes: Record<string, Vote>;
  scores: Record<string, number>;
  members: Record<string, Member>;
  hostId: string;
};

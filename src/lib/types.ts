export type PromptCategory = "modifier" | "situation" | "content";

export type PromptCard = {
  id: string;
  text: string;
  weight?: number;
};

export type PromptsJson = {
  version: string;
  modifier: PromptCard[];
  situation: PromptCard[];
  content: PromptCard[];
};

export type Phase = "ANSWER" | "VOTE" | "RESULT";

export type Prompt = {
  modifierId: string;
  situationId: string;
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
  prompt: Prompt;
  submissions: Record<string, Submission>;
  votes: Record<string, Vote>;
  scores: Record<string, number>;
  members: Record<string, Member>;
  hostId: string;
};

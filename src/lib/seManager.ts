import { getSeEnabled, getSeVolume } from "./storage";

export type SeKey = "submit" | "vote" | "phase" | "result" | "finalResult" | "error";

const SE_PATHS: Record<SeKey, string> = {
  submit: "assets/se/submit.mp3",
  vote: "assets/se/vote.mp3",
  phase: "assets/se/phase.mp3",
  result: "assets/se/result.mp3",
  finalResult: "assets/se/final_result.mp3",
  error: "assets/se/error.mp3",
};

function buildSeUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function playSe(key: SeKey) {
  if (!getSeEnabled()) return;
  const audio = new Audio(buildSeUrl(SE_PATHS[key]));
  audio.volume = getSeVolume();
  void audio.play().catch(() => {
    // Ignore autoplay or source errors to keep game flow unaffected.
  });
}

import type { Prompt, PromptsJson, PromptCard } from "./types";

// 重み付き抽選（weight未指定は1）
function pickWeighted(items: PromptCard[]): PromptCard {
  const normalized = items.map((x) => ({ ...x, weight: x.weight ?? 1 }));
  const total = normalized.reduce((s, x) => s + (x.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const it of normalized) {
    r -= it.weight ?? 1;
    if (r <= 0) return it;
  }
  return normalized[normalized.length - 1];
}

export function buildPrompt(data: PromptsJson): Prompt {
  const m = pickWeighted(data.modifier);
  const s = pickWeighted(data.situation);
  const c = pickWeighted(data.content);

  return {
    modifierId: m.id,
    situationId: s.id,
    contentId: c.id,
    text: `${m.text}${s.text}${c.text}`,
  };
}

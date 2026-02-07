import type { PromptsJson } from "./types";

function assertPromptArray(value: unknown): value is Array<{ id: string; text: string; weight?: number }> {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    const weight = row.weight;
    return (
      typeof row.id === "string" &&
      typeof row.text === "string" &&
      (weight === undefined || typeof weight === "number")
    );
  });
}

export async function fetchPrompts(baseUrl: string): Promise<PromptsJson> {
  const res = await fetch(`${baseUrl}prompts.json`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`prompts.jsonの取得に失敗しました (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  if (!json || typeof json !== "object") {
    throw new Error("prompts.jsonの形式が不正です");
  }
  const obj = json as Record<string, unknown>;
  if (
    typeof obj.version !== "string" ||
    !assertPromptArray(obj.modifier) ||
    !assertPromptArray(obj.situation) ||
    !assertPromptArray(obj.content)
  ) {
    throw new Error("prompts.jsonのスキーマが一致しません");
  }
  return obj as unknown as PromptsJson;
}

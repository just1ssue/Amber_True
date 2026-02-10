// モック用: 匿名ユーザー情報をローカルに保持
export function getOrCreateUserId(): string {
  const key = "amber_true_user_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function getOrCreateDisplayName(): string {
  const key = "amber_true_display_name";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  const name = `Guest-${suffix}`;
  localStorage.setItem(key, name);
  return name;
}

export function setDisplayName(name: string) {
  localStorage.setItem("amber_true_display_name", name);
}

const SE_ENABLED_KEY = "amber_true_se_enabled";
const SE_VOLUME_KEY = "amber_true_se_volume";

export function getSeEnabled(): boolean {
  const raw = localStorage.getItem(SE_ENABLED_KEY);
  if (raw === null) return true;
  return raw !== "0";
}

export function setSeEnabled(enabled: boolean) {
  localStorage.setItem(SE_ENABLED_KEY, enabled ? "1" : "0");
}

export function getSeVolume(): number {
  const raw = localStorage.getItem(SE_VOLUME_KEY);
  if (!raw) return 0.65;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 0.65;
  return Math.min(1, Math.max(0, parsed));
}

export function setSeVolume(volume: number) {
  const clamped = Math.min(1, Math.max(0, volume));
  localStorage.setItem(SE_VOLUME_KEY, String(clamped));
}

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

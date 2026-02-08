const DEBUG_MEMBER_PREFIX = "__debug_member_";

export function isDebugMemberId(userId: string): boolean {
  return userId.startsWith(DEBUG_MEMBER_PREFIX);
}

export function debugMemberName(userId: string): string {
  const num = Number(userId.slice(DEBUG_MEMBER_PREFIX.length));
  const idx = Number.isFinite(num) ? num + 1 : 0;
  return `Debug-${String(idx).padStart(2, "0")}`;
}

export function buildDebugActiveMemberIds(baseIds: string[], maxMembers: number): string[] {
  const normalized = Array.from(new Set(baseIds));
  const out = normalized.slice(0, maxMembers);
  let i = 0;
  while (out.length < maxMembers) {
    out.push(`${DEBUG_MEMBER_PREFIX}${i}`);
    i += 1;
  }
  return out;
}

export function mockSubmissionText(index: number): string {
  return `デバッグ回答 ${index + 1}`;
}

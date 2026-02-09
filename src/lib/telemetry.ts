export type AdapterTelemetryEvent = {
  category: "auth" | "sync";
  code: string;
  reason: string;
  roomId?: string;
  adapter: "liveblocks";
  timestamp: string;
};

const TELEMETRY_ENDPOINT = import.meta.env.VITE_TELEMETRY_ENDPOINT as string | undefined;

function canSendTelemetry(endpoint: string | undefined): endpoint is string {
  return typeof endpoint === "string" && endpoint.trim().length > 0;
}

export function reportAdapterTelemetry(
  event: Omit<AdapterTelemetryEvent, "timestamp" | "adapter">,
) {
  const payload: AdapterTelemetryEvent = {
    ...event,
    adapter: "liveblocks",
    timestamp: new Date().toISOString(),
  };

  if (import.meta.env.DEV) {
    console.warn("[Amber_True][telemetry]", payload);
  }

  if (!canSendTelemetry(TELEMETRY_ENDPOINT)) return;

  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // テレメトリ送信エラーはゲーム進行に影響させない
  }
}

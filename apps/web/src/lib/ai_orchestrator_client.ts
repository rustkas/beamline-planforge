export type ApiError = {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type TurnResult = {
  ok: boolean;
  session_id: string;
  project_id: string;
  base_revision_id: string;
  new_revision_id?: string;
  proposed_patch?: unknown;
  violations?: unknown[];
  message: string;
};

function make_error(status: number, message: string, details?: Record<string, unknown>): ApiError {
  return { code: `http.${status}`, message, status, details };
}

export function create_ai_orchestrator_client(base_url: string) {
  async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    try {
      const res = await fetch(`${base_url}${path}`, init);
      const text = await res.text();
      const body = text.length > 0 ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const message = (body as any)?.error?.message ?? `Request failed (${res.status})`;
        return { ok: false, error: make_error(res.status, message, body as any) };
      }
      return { ok: true, data: body as T };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      return { ok: false, error: { code: "network.error", message, status: 0 } };
    }
  }

  return {
    health: () => request<{ ok: boolean; version: string }>("/health"),
    create_session: (project_id: string, revision_id: string) =>
      request<{ session_id: string }>("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id, revision_id })
      }),
    demo_session: () => request<{ session_id: string; project_id: string; revision_id: string }>("/demo/session", {
      method: "POST"
    }),
    run_turn: (session_id: string, command: string) =>
      request<TurnResult>(`/sessions/${session_id}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command })
      })
  };
}

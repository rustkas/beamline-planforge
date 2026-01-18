export type ApiError = {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

function make_error(status: number, message: string, details?: Record<string, unknown>): ApiError {
  return { code: `http.${status}`, message, status, details };
}

export function create_api_client(base_url: string) {
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
    create_session: (project_id: string, revision_id: string) =>
      request<{ session_id: string; project_id: string; revision_id: string }>("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id, revision_id })
      }),
    get_session: (session_id: string) =>
      request<{
        session: { session_id: string; project_id: string; last_revision_id: string };
        messages: Array<{ message_id: string; role: string; content: string; ts: number }>;
        proposals: Array<{ proposal_id: string; variant_index: number }>;
      }>(`/sessions/${session_id}`),
    add_message: (session_id: string, role: "user" | "assistant" | "system", content: string) =>
      request<{ message_id: string }>(`/sessions/${session_id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, content, ts: Date.now() })
      }),
    add_proposals: (
      session_id: string,
      revision_id: string,
      proposals: Array<{
        variant_index: number;
        patch: Record<string, unknown>;
        rationale: Record<string, unknown>;
        metrics?: Record<string, unknown>;
        explanation_text?: string;
      }>
    ) =>
      request<{ proposals: Array<{ proposal_id: string }> }>(`/sessions/${session_id}/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision_id, proposals })
      }),
    preview_patch: (project_id: string, revision_id: string, patch: unknown) =>
      request<{ kitchen_state: unknown; violations: unknown[] }>(
        `/projects/${project_id}/revisions/${revision_id}/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch)
        }
      ),
    advance_session: (session_id: string, revision_id: string) =>
      request<{ session_id: string; revision_id: string }>(`/sessions/${session_id}/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision_id })
      }),
    create_project: (kitchen_state: unknown) =>
      request<{ project_id: string; revision_id: string; violations: unknown[] }>("/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kitchen_state)
      }),
    get_revision: (project_id: string, revision_id: string) =>
      request<{ kitchen_state: unknown }>(`/projects/${project_id}/revisions/${revision_id}`),
    apply_patch: (project_id: string, revision_id: string, patch: unknown) =>
      request<{ new_revision_id: string; violations: unknown[] }>(
        `/projects/${project_id}/revisions/${revision_id}/patch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch)
        }
      ),
    render: (project_id: string, revision_id: string, quality: "draft" | "quality") =>
      request<unknown>(`/projects/${project_id}/revisions/${revision_id}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quality })
      })
  };
}

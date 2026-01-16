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

export type ApiError = {
  code: string;
  message: string;
  status: number;
  body?: unknown;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

type CreateProjectResponse = {
  project_id: string;
  revision_id: string;
  violations: unknown[];
};

type PatchResponse = {
  new_revision_id: string;
  violations: unknown[];
};

type RevisionResponse = {
  kitchen_state: unknown;
};

type QuoteResponse = {
  quote_id: string;
  ruleset_version: string;
  total: { currency: string; amount: number };
  currency: string;
  items: Array<{
    code: string;
    title: string;
    qty: number;
    unit_price: { currency: string; amount: number };
    amount: { currency: string; amount: number };
    meta?: Record<string, unknown>;
  }>;
  diagnostics?: Array<{
    plugin_id: string;
    ok: boolean;
    added_items: number;
    added_adjustments: number;
    errors: string[];
    warnings: string[];
  }>;
};

type OrderResponse = {
  order_id: string;
  status: string;
};

type ExportArtifact = {
  id: string;
  name: string;
  mime: string;
  sha256: string;
  size: number;
  download_url?: string;
  url?: string;
};

type ExportResponse = {
  export_id: string;
  artifacts: ExportArtifact[];
};

function make_error(status: number, message: string, body?: unknown): ApiError {
  return { code: `http.${status}`, message, status, body };
}

export function create_api_core_client(base_url: string) {
  async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    try {
      const res = await fetch(`${base_url}${path}`, init);
      const text = await res.text();
      const body = text.length > 0 ? JSON.parse(text) : null;
      if (!res.ok) {
        const message = body?.error?.message ?? `Request failed (${res.status})`;
        return { ok: false, error: make_error(res.status, message, body) };
      }
      return { ok: true, data: body as T };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      return { ok: false, error: { code: "network.error", message, status: 0 } };
    }
  }

  return {
    health: () => request<{ ok: boolean; version: string }>("/health"),
    create_project: (kitchen_state: unknown) =>
      request<CreateProjectResponse>("/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kitchen_state)
      }),
    get_revision: (project_id: string, revision_id: string) =>
      request<RevisionResponse>(`/projects/${project_id}/revisions/${revision_id}`),
    apply_patch: (project_id: string, revision_id: string, patch: unknown) =>
      request<PatchResponse>(`/projects/${project_id}/revisions/${revision_id}/patch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      }),
    create_quote: (project_id: string, revision_id: string, ruleset_version?: string) =>
      request<QuoteResponse>("/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id, revision_id, ruleset_version })
      }),
    get_quote: (quote_id: string) => request<QuoteResponse>(`/quotes/${quote_id}`),
    create_order: (
      payload: {
        project_id: string;
        revision_id: string;
        quote_id: string;
        customer: { name: string; email: string; phone?: string };
        delivery: { line1: string; city: string; country: string };
      },
      idempotency_key?: string
    ) =>
      request<OrderResponse>("/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(idempotency_key ? { "idempotency-key": idempotency_key } : {})
        },
        body: JSON.stringify(payload)
      }),
    get_order: (order_id: string) => request<unknown>(`/orders/${order_id}`),
    create_exports: (project_id: string, revision_id: string, format: "json" | "pdf" = "json") =>
      request<ExportResponse>("/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id, revision_id, format })
      }),
    get_export: (export_id: string) => request<ExportResponse>(`/exports/${export_id}`),
    quote: (project_id: string, revision_id: string) =>
      request<QuoteResponse>(`/projects/${project_id}/revisions/${revision_id}/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }),
    render: (project_id: string, revision_id: string, quality: "draft" | "quality") =>
      request<unknown>(`/projects/${project_id}/revisions/${revision_id}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quality })
      })
  };
}

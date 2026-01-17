export type LicenseStatus = {
  ok: boolean;
  allowed: boolean;
  exp?: number;
  refresh_at?: number;
  last_good_refresh_at?: number;
  revoked?: boolean;
  token_jti?: string;
  diagnostics?: string[];
  error?: { code: string; message: string };
};

export type LicenseRefresh = {
  ok: boolean;
  token?: string;
  exp?: number;
  refresh_at?: number;
  last_good_refresh_at?: number;
  revoked_jtis?: string[];
  error?: { code: string; message: string };
};

export type LicenseClient = {
  status: (token: string) => Promise<LicenseStatus>;
  refresh: (token: string) => Promise<LicenseRefresh>;
  trust_store: () => Promise<unknown>;
};

export function create_license_client(base_url: string): LicenseClient {
  async function request_json(path: string, init?: RequestInit): Promise<Response> {
    const url = `${base_url.replace(/\/$/, "")}${path}`;
    return fetch(url, init);
  }

  return {
    async status(token: string): Promise<LicenseStatus> {
      const res = await request_json("/license/status", {
        headers: { authorization: `Bearer ${token}` }
      });
      const json = (await res.json()) as LicenseStatus;
      return json;
    },
    async refresh(token: string): Promise<LicenseRefresh> {
      const res = await request_json("/license/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const json = (await res.json()) as LicenseRefresh;
      return json;
    },
    async trust_store(): Promise<unknown> {
      const res = await request_json("/license/trust-store");
      if (!res.ok) {
        throw new Error(`Trust store fetch failed (${res.status})`);
      }
      return res.json();
    }
  };
}

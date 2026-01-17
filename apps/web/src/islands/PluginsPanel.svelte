<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { app_state } from "../lib/state";
  import { create_license_client, type LicenseStatus } from "../lib/license_client";
  import {
    create_host_api,
    validate_manifest,
    verify_plugin_license,
    load_trust_store,
    type plugin_manifest,
    type trust_store
  } from "@planforge/plugin-runtime";
  import { create_api_core_client } from "../lib/api_core_client";
  import { create_core_client } from "../lib/core_adapter";
  import { remove_loaded_plugin, set_loaded_plugin } from "../lib/plugins/registry";
  import type { license_decision } from "@planforge/plugin-sdk";

  type PluginEntry = {
    id: string;
    manifest_url: string;
    entry_url: string;
    manifest?: plugin_manifest;
    status: "idle" | "loaded" | "error";
    error?: string;
    host?: WorkerHost;
    last_result?: unknown;
    license?: license_decision;
  };

  const plugins: PluginEntry[] = [
    {
      id: "com.planforge.demo.constraints",
      manifest_url: "/plugins/demo-constraints-wasm/plugin.json",
      entry_url: "/plugins/demo-constraints-wasm/dist/loader.js",
      status: "idle"
    }
  ];

  let trustStore: trust_store | null = null;
  let entitlementToken = "";
  let licenseStatus: LicenseStatus | null = null;
  let refreshTimer: number | null = null;

  function entitlement_key(): string {
    return "planforge.entitlement_token";
  }

  function license_ok_key(): string {
    return "planforge.license_last_online_ok";
  }

  async function load_trust(): Promise<void> {
    if (trustStore) return;
    try {
      const license = create_license_client($app_state.api_base_url);
      const remote = (await license.trust_store()) as trust_store;
      trustStore = remote;
    } catch {
      try {
        trustStore = await load_trust_store("/trust/trust_store.json");
      } catch {
        trustStore = null;
      }
    }
  }

  function read_entitlement(): string {
    try {
      return localStorage.getItem(entitlement_key()) ?? "";
    } catch {
      return "";
    }
  }

  function write_entitlement(value: string): void {
    try {
      localStorage.setItem(entitlement_key(), value);
    } catch {
      return;
    }
  }

  function read_last_ok(): number | null {
    try {
      const raw = localStorage.getItem(license_ok_key());
      if (!raw) return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    } catch {
      return null;
    }
  }

  function write_last_ok(value: number): void {
    try {
      localStorage.setItem(license_ok_key(), String(value));
    } catch {
      return;
    }
  }

  async function fetch_artifacts(manifest: plugin_manifest, manifest_url: string): Promise<Record<string, Uint8Array>> {
    const hashes = manifest.integrity?.hashes ?? {};
    const base = new URL(manifest_url, window.location.origin);
    const artifacts: Record<string, Uint8Array> = {};
    for (const path of Object.keys(hashes)) {
      const url = new URL(path, base);
      const res = await fetch(url.toString());
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      artifacts[path] = new Uint8Array(buf);
    }
    return artifacts;
  }

  async function load_plugin(entry: PluginEntry): Promise<void> {
    try {
      await load_trust();
      await refresh_status();
      const res = await fetch(entry.manifest_url);
      const manifest = (await res.json()) as plugin_manifest;
      const validation = validate_manifest(manifest);
      if (!validation.ok) {
        entry.status = "error";
        entry.error = validation.errors.join("; ");
        return;
      }

      const artifacts = await fetch_artifacts(manifest, entry.manifest_url);
      const now = Math.floor(Date.now() / 1000);
      const decision = await verify_plugin_license({
        manifest,
        artifacts,
        trust_store: trustStore,
        entitlement_token: entitlementToken.length > 0 ? entitlementToken : null,
        now_epoch_seconds: now,
        last_online_ok_epoch: read_last_ok() ?? undefined,
        revoked_jtis: licenseStatus?.revoked && licenseStatus.token_jti ? [licenseStatus.token_jti] : []
      });
      entry.license = decision;
      if (!decision.allow_load) {
        entry.status = "error";
        entry.error = decision.diagnostics.map((d) => d.message).join("; ");
        return;
      }
      if (decision.ok) {
        write_last_ok(now);
      }

      const worker = new Worker(entry.entry_url);
      const core = create_core_client();
      const host_api = create_host_api(manifest, {
        get_context: () => ({
          host_version: "0.1.0",
          plugin_id: manifest.id,
          project_id: $app_state.project_id ?? undefined,
          revision_id: $app_state.revision_id ?? undefined
        }),
        get_license_context: async () => ({
          ok: entry.license?.ok ?? false,
          allow_capabilities:
            entry.license?.allow_capabilities ?? {
              constraints: false,
              pricing: false,
              render: false,
              export: false,
              solver: false,
              ui: false
            },
          exp: licenseStatus?.exp,
          refresh_at: licenseStatus?.refresh_at,
          last_good_refresh_at: licenseStatus?.last_good_refresh_at,
          revoked: licenseStatus?.revoked ?? false,
          diagnostics: entry.license?.diagnostics
        }),
        get_project_state: async () => {
          if ($app_state.mode === "server" && $app_state.project_id && $app_state.revision_id) {
            const api = create_api_core_client($app_state.api_base_url);
            const res = await api.get_revision($app_state.project_id, $app_state.revision_id);
            if (res.ok) {
              return {
                kitchen_state: res.data.kitchen_state,
                project_id: $app_state.project_id,
                revision_id: $app_state.revision_id
              };
            }
          }
          return {
            kitchen_state: $app_state.kitchen_state,
            project_id: $app_state.project_id ?? undefined,
            revision_id: $app_state.revision_id ?? undefined
          };
        },
        validate_layout: async (params) => {
          const { kitchen_state } = params as { kitchen_state: unknown };
          return core.validate_layout(kitchen_state);
        },
        derive_render_model: async (params) => {
          const { kitchen_state, quality } = params as { kitchen_state: unknown; quality: "draft" | "quality" };
          if ($app_state.mode === "server" && $app_state.project_id && $app_state.revision_id) {
            const api = create_api_core_client($app_state.api_base_url);
            const res = await api.render($app_state.project_id, $app_state.revision_id, quality);
            if (res.ok) return res.data;
          }
          return core.derive_render_model(kitchen_state, quality);
        }
      });

      const host = new WorkerHost(manifest, worker, host_api);
      await host.init_plugin({
        host_version: "0.1.0",
        plugin_id: manifest.id,
        project_id: $app_state.project_id ?? undefined,
        revision_id: $app_state.revision_id ?? undefined
      });
      entry.manifest = manifest;
      entry.host = host;
      entry.status = "loaded";
      if (entry.license?.allow_capabilities) {
        manifest.capabilities = {
          constraints: entry.license.allow_capabilities.constraints,
          solver: entry.license.allow_capabilities.solver,
          pricing: entry.license.allow_capabilities.pricing,
          render: entry.license.allow_capabilities.render,
          export: entry.license.allow_capabilities.export,
          ui: { panels: [], wizard_steps: [], commands: [] }
        };
      }
      set_loaded_plugin({ manifest, host });
    } catch (error) {
      entry.status = "error";
      entry.error = error instanceof Error ? error.message : "Failed to load plugin";
      remove_loaded_plugin(entry.id);
    }
  }

  function build_context(plugin_id: string): { host_version: string; plugin_id: string; project_id?: string; revision_id?: string } {
    return {
      host_version: "0.1.0",
      plugin_id,
      project_id: $app_state.project_id ?? undefined,
      revision_id: $app_state.revision_id ?? undefined
    };
  }

  async function run_constraints_hook(entry: PluginEntry): Promise<void> {
    if (!entry.host) return;
    entry.last_result = await entry.host.call_plugin("plugin.constraints.post_validate", {
      context: build_context(entry.manifest?.id ?? entry.id),
      project: { project_id: $app_state.project_id ?? undefined, revision_id: $app_state.revision_id ?? undefined },
      params: {
        kitchen_state: $app_state.kitchen_state,
        base_violations: $app_state.violations,
        mode: "full"
      }
    });
  }

  async function run_ping(entry: PluginEntry): Promise<void> {
    if (!entry.host) return;
    entry.last_result = await entry.host.call_plugin("plugin.ping", { nonce: String(Date.now()) });
  }

  async function run_legacy_validate(entry: PluginEntry): Promise<void> {
    if (!entry.host) return;
    entry.last_result = await entry.host.call_plugin("plugin.run", { command: "validate" });
  }

  async function run_render_hook(entry: PluginEntry): Promise<void> {
    if (!entry.host) return;
    if (!$app_state.render_model) {
      entry.last_result = { ok: false, error: { code: "render.not_ready", message: "Render model not available" } };
      return;
    }
    entry.last_result = await entry.host.call_plugin("plugin.render.post_render", {
      context: build_context(entry.manifest?.id ?? entry.id),
      project: { project_id: $app_state.project_id ?? undefined, revision_id: $app_state.revision_id ?? undefined },
      params: {
        kitchen_state: $app_state.kitchen_state,
        render_model: $app_state.render_model,
        quality: "draft"
      }
    });
  }

  onMount(() => {
    entitlementToken = read_entitlement();
    for (const entry of plugins) {
      void load_plugin(entry);
    }

    refreshTimer = window.setInterval(() => {
      void refresh_status();
    }, 60_000);
  });

  onDestroy(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  });

  async function apply_entitlement(): Promise<void> {
    write_entitlement(entitlementToken);
    await refresh_status();
    for (const entry of plugins) {
      entry.status = "idle";
      entry.error = undefined;
      entry.host = undefined;
      entry.manifest = undefined;
      entry.last_result = undefined;
      entry.license = undefined;
      remove_loaded_plugin(entry.id);
      await load_plugin(entry);
    }
  }

  async function refresh_status(): Promise<void> {
    if (!entitlementToken) {
      licenseStatus = null;
      return;
    }

    const license = create_license_client($app_state.api_base_url);
    try {
      const status = await license.status(entitlementToken);
      licenseStatus = status;
      if (status.last_good_refresh_at) {
        write_last_ok(status.last_good_refresh_at);
      }
      const now = Math.floor(Date.now() / 1000);
      if (status.refresh_at && now >= status.refresh_at) {
        const refreshed = await license.refresh(entitlementToken);
        if (refreshed.ok && refreshed.token) {
          entitlementToken = refreshed.token;
          write_entitlement(entitlementToken);
          if (refreshed.last_good_refresh_at) {
            write_last_ok(refreshed.last_good_refresh_at);
          }
          licenseStatus = {
            ...status,
            exp: refreshed.exp ?? status.exp,
            refresh_at: refreshed.refresh_at ?? status.refresh_at,
            last_good_refresh_at: refreshed.last_good_refresh_at ?? status.last_good_refresh_at
          };
        } else if (refreshed.error) {
          licenseStatus = { ...status, ok: false, allowed: false, error: refreshed.error };
        }
      }
    } catch (error) {
      licenseStatus = {
        ok: false,
        allowed: false,
        error: { code: "license.refresh_failed", message: error instanceof Error ? error.message : "Refresh failed" }
      };
    }
  }
</script>

<section class="plugins">
  <header>
    <h3>Plugins</h3>
    <p class="meta">Runtime demo</p>
  </header>

  <div class="entitlement">
    <label>
      Entitlement token
      <textarea rows="3" bind:value={entitlementToken} placeholder="Paste JWT token"></textarea>
    </label>
    <button class="secondary" on:click={apply_entitlement}>Apply token</button>
    {#if licenseStatus}
      <div class="meta">
        {licenseStatus.allowed ? "License active" : "License inactive"}
        {#if licenseStatus.exp}
          · exp {licenseStatus.exp}
        {/if}
      </div>
      {#if licenseStatus.error}
        <div class="error">{licenseStatus.error.code}: {licenseStatus.error.message}</div>
      {/if}
    {/if}
  </div>

  {#each plugins as plugin}
    <div class="plugin-card">
      <div class="row">
        <strong>{plugin.id}</strong>
        <span class="badge {plugin.status}">{plugin.status}</span>
      </div>
      {#if plugin.manifest}
        <div class="meta">v{plugin.manifest.version} · {plugin.manifest.runtime.kind}</div>
      {/if}
      {#if plugin.license}
        <div class="meta">
          {plugin.license.ok ? "Licensed" : "Unlicensed"}
        </div>
      {/if}
      {#if plugin.error}
        <div class="error">{plugin.error}</div>
      {/if}
      <div class="actions">
        <button on:click={() => run_ping(plugin)} disabled={plugin.status !== "loaded"}>Ping</button>
        <button on:click={() => run_legacy_validate(plugin)} disabled={plugin.status !== "loaded"}>Run validate</button>
        <button on:click={() => run_constraints_hook(plugin)} disabled={plugin.status !== "loaded"}>Run constraints</button>
        <button on:click={() => run_render_hook(plugin)} disabled={plugin.status !== "loaded"}>Run render</button>
      </div>
      {#if plugin.last_result}
        <details>
          <summary>Result</summary>
          <pre>{JSON.stringify(plugin.last_result, null, 2)}</pre>
        </details>
      {/if}
    </div>
  {/each}
</section>

<style>
  .plugins {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed #e5e7eb;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .plugin-card {
    border: 1px solid #e5e7eb;
    border-radius: 0.6rem;
    padding: 0.75rem;
    background: #fff;
    margin-bottom: 0.75rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    background: #f3f4f6;
  }
  .badge.loaded {
    background: #dcfce7;
    color: #166534;
  }
  .badge.error {
    background: #fee2e2;
    color: #991b1b;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .entitlement {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  textarea {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
    font-size: 0.8rem;
    resize: vertical;
  }
  pre {
    background: #f9fafb;
    padding: 0.5rem;
    border-radius: 0.4rem;
    font-size: 0.75rem;
  }
  .error {
    color: #991b1b;
    font-size: 0.85rem;
  }
  .meta {
    color: #6b7280;
    font-size: 0.85rem;
  }
</style>

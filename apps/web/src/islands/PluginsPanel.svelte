<script lang="ts">
  import { onMount } from "svelte";
  import { app_state } from "../lib/state";
  import { create_host_api, validate_manifest, WorkerHost, type plugin_manifest } from "@planforge/plugin-runtime";
  import { create_api_core_client } from "../lib/api_core_client";

  type PluginEntry = {
    id: string;
    manifest_url: string;
    entry_url: string;
    manifest?: plugin_manifest;
    status: "idle" | "loaded" | "error";
    error?: string;
    host?: WorkerHost;
    last_result?: unknown;
  };

  const plugins: PluginEntry[] = [
    {
      id: "com.planforge.demo.constraints",
      manifest_url: "/plugins/demo-constraints-wasm/plugin.json",
      entry_url: "/plugins/demo-constraints-wasm/dist/loader.js",
      status: "idle"
    }
  ];

  async function load_plugin(entry: PluginEntry): Promise<void> {
    try {
      const res = await fetch(entry.manifest_url);
      const manifest = (await res.json()) as plugin_manifest;
      const validation = validate_manifest(manifest);
      if (!validation.ok) {
        entry.status = "error";
        entry.error = validation.errors.join("; ");
        return;
      }

      const worker = new Worker(new URL("../workers/plugin_runtime.worker.ts", import.meta.url), { type: "module" });
      const host_api = create_host_api(manifest, {
        get_context: () => ({
          host_version: "0.1.0",
          plugin_id: manifest.id,
          project_id: $app_state.project_id ?? undefined,
          revision_id: $app_state.revision_id ?? undefined
        }),
        get_project_state: async () => {
          if ($app_state.mode === "server" && $app_state.project_id && $app_state.revision_id) {
            const api = create_api_core_client($app_state.api_base_url);
            const res = await api.get_revision($app_state.project_id, $app_state.revision_id);
            if (res.ok) return res.data.kitchen_state;
          }
          return $app_state.kitchen_state;
        }
      });

      const host = new WorkerHost(manifest, worker, host_api);
      await host.init_plugin(entry.entry_url);
      entry.manifest = manifest;
      entry.host = host;
      entry.status = "loaded";
    } catch (error) {
      entry.status = "error";
      entry.error = error instanceof Error ? error.message : "Failed to load plugin";
    }
  }

  async function run_command(entry: PluginEntry, command: string): Promise<void> {
    if (!entry.host) return;
    entry.last_result = await entry.host.call_plugin("plugin.run", { command });
  }

  onMount(() => {
    for (const entry of plugins) {
      void load_plugin(entry);
    }
  });
</script>

<section class="plugins">
  <header>
    <h3>Plugins</h3>
    <p class="meta">Runtime demo</p>
  </header>

  {#each plugins as plugin}
    <div class="plugin-card">
      <div class="row">
        <strong>{plugin.id}</strong>
        <span class="badge {plugin.status}">{plugin.status}</span>
      </div>
      {#if plugin.manifest}
        <div class="meta">v{plugin.manifest.version} · {plugin.manifest.runtime.kind}</div>
      {/if}
      {#if plugin.error}
        <div class="error">{plugin.error}</div>
      {/if}
      <div class="actions">
        <button on:click={() => run_command(plugin, "ping")} disabled={plugin.status !== "loaded"}>Ping</button>
        <button on:click={() => run_command(plugin, "validate")} disabled={plugin.status !== "loaded"}>Run validate</button>
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

<script lang="ts">
  import { onMount } from "svelte";
  import {
    app_state,
    init_demo,
    move_first_object_x,
    recompute,
    generate_layout_proposals,
    select_layout_proposal,
    reset_demo,
    set_pricing_channel,
    set_render_quality
  } from "../lib/state";
  import AgentChat from "./AgentChat.svelte";
  import PluginsPanel from "./PluginsPanel.svelte";
  import { create_api_core_client } from "../lib/api_core_client";

  export let projectId: string | null = null;

  const defaultApiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const defaultOrchestratorBaseUrl = import.meta.env.PUBLIC_ORCHESTRATOR_BASE_URL ?? "http://localhost:3002";

  let xInput = "";
  let inputError = "";
  let initialized = false;
  let exportBusy = false;
  let exportError = "";
  let exportArtifacts: Array<{
    id: string;
    name: string;
    download_url?: string;
    url?: string;
  }> = [];

  $: if (!initialized) {
    const state = $app_state;
    const firstX = (state.kitchen_state as any)?.layout?.objects?.[0]?.transform_mm?.position_mm?.x;
    if (typeof firstX === "number") {
      xInput = String(firstX);
      initialized = true;
    }
  }

  function getSummary(state: any): string {
    const room = state?.room?.size_mm;
    const objects = state?.layout?.objects?.length ?? 0;
    if (!room) return "No room loaded";
    return `Room ${room.width}x${room.depth}x${room.height} mm, objects: ${objects}`;
  }

  async function applyX(): Promise<void> {
    const parsed = Number(xInput);
    if (!Number.isFinite(parsed)) {
      inputError = "Enter a valid number";
      return;
    }
    inputError = "";
    await move_first_object_x(parsed);
  }

  async function setMode(mode: "server" | "local"): Promise<void> {
    await init_demo(mode, defaultApiBaseUrl, defaultOrchestratorBaseUrl);
  }

  function handle_channel_change(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    const value = target?.value ?? "";
    void set_pricing_channel(value.length > 0 ? value : undefined);
  }

  function handle_quality_change(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    const value = target?.value === "quality" ? "quality" : "draft";
    void set_render_quality(value);
  }

  function format_money(value: any): string {
    if (!value || typeof value.amount !== "number") return "-";
    return `${value.amount} ${value.currency ?? ""}`.trim();
  }

  async function request_exports(format: "json" | "pdf"): Promise<void> {
    if ($app_state.mode !== "server") return;
    if (!$app_state.project_id || !$app_state.revision_id) return;
    exportBusy = true;
    exportError = "";
    try {
      const api = create_api_core_client($app_state.api_base_url);
      const res = await api.create_exports($app_state.project_id, $app_state.revision_id, format);
      if (!res.ok) {
        exportError = res.error.message;
        return;
      }
      exportArtifacts = res.data.artifacts.map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
        download_url: artifact.download_url ? `${$app_state.api_base_url}${artifact.download_url}` : undefined,
        url: artifact.url
      }));
    } catch (err) {
      exportError = err instanceof Error ? err.message : "Export failed";
    } finally {
      exportBusy = false;
    }
  }

  onMount(async () => {
    if (projectId === "demo") {
      const storedMode = localStorage.getItem("planforge_demo_mode");
      const mode = storedMode === "local" ? "local" : "server";
      await init_demo(mode, defaultApiBaseUrl, defaultOrchestratorBaseUrl);
    }
  });
</script>

<section class="panel">
  <header>
    <h2>Project Editor</h2>
    <p class="meta">{projectId ?? "(no id)"}</p>
  </header>

  <div class="summary">{getSummary($app_state.kitchen_state)}</div>

  <div class="meta-block">
    <div>Mode: <strong>{$app_state.mode}</strong></div>
    {#if $app_state.mode === "server"}
      <div>API: {$app_state.api_base_url}</div>
      <div>Orchestrator: {$app_state.orchestrator_base_url}</div>
      <div>Project: {$app_state.project_id ?? "-"}</div>
      <div>Revision: {$app_state.revision_id ?? "-"}</div>
    {/if}
  </div>

  {#if $app_state.error}
    <div class="error">{$app_state.error}</div>
  {/if}

  <div class="controls">
    <div class="mode-toggle">
      <label>
        <input type="radio" name="mode" value="server" checked={$app_state.mode === "server"} on:change={() => setMode("server")} />
        Server
      </label>
      <label>
        <input type="radio" name="mode" value="local" checked={$app_state.mode === "local"} on:change={() => setMode("local")} />
        Local
      </label>
      {#if $app_state.mode === "server"}
        <button type="button" class="secondary" on:click={reset_demo} disabled={$app_state.busy}>Reset demo</button>
      {/if}
    </div>
    <label>
      First object X (mm)
      <input type="number" bind:value={xInput} />
    </label>
    <label>
      Render quality
      <select value={$app_state.render_quality} on:change={handle_quality_change}>
        <option value="draft">draft</option>
        <option value="quality">quality</option>
      </select>
    </label>
    <button on:click={applyX} disabled={$app_state.busy}>Apply</button>
    <button on:click={recompute} disabled={$app_state.busy}>Recompute</button>
    {#if inputError}
      <div class="error">{inputError}</div>
    {/if}
  </div>

  <div class="violations">
    <h3>Violations</h3>
    {#if $app_state.violations.length === 0}
      <p class="meta">No violations</p>
    {:else}
      <ul>
        {#each $app_state.violations as v}
          <li>
            <strong>{v.code}</strong> — {v.message}
            {#if v.object_ids.length > 0}
              <span class="meta">[{v.object_ids.join(", ")}]</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="quote">
    <h3>Quote</h3>
    <div class="row">
      <label>
        Channel
        <select value={$app_state.pricing_context.channel ?? ""} on:change={handle_channel_change}>
          <option value="">default</option>
          <option value="rush">rush</option>
        </select>
      </label>
    </div>

    {#if $app_state.final_quote}
      <p><strong>Total:</strong> {format_money($app_state.final_quote.total)}</p>
      <details>
        <summary>Line items ({$app_state.final_quote.items.length})</summary>
        <ul>
          {#each $app_state.final_quote.items as item}
            <li>
              <code>{item.code}</code> — {item.title} — {format_money(item.amount)}
            </li>
          {/each}
        </ul>
      </details>
      <details>
        <summary>Plugin diagnostics ({$app_state.quote_diagnostics.length})</summary>
        <ul>
          {#each $app_state.quote_diagnostics as diag}
            <li>
              <strong>{diag.plugin_id}</strong> — {diag.ok ? "ok" : "error"}
              (items {diag.added_items}, adj {diag.added_adjustments})
              {#if diag.errors.length > 0}
                <div class="error">{diag.errors.join("; ")}</div>
              {/if}
              {#if diag.warnings.length > 0}
                <div class="warn">{diag.warnings.join("; ")}</div>
              {/if}
            </li>
          {/each}
        </ul>
      </details>
    {:else}
      <p class="meta">No quote yet.</p>
    {/if}
  </div>

  <div class="variants">
    <h3>Layout Variants</h3>
    {#if $app_state.mode !== "server"}
      <p class="meta">Variants are available in server mode.</p>
    {:else}
      <div class="row">
        <button type="button" on:click={generate_layout_proposals} disabled={$app_state.busy}>
          Generate variants
        </button>
      </div>
      {#if $app_state.session_proposals.length === 0}
        <p class="meta">No proposals yet.</p>
      {:else}
        <ul>
          {#each $app_state.session_proposals as proposal}
            <li>
              <div class="variant-header">
                <strong>Variant {proposal.variant_index + 1}</strong>
                <button
                  type="button"
                  on:click={() => select_layout_proposal(proposal.proposal_id)}
                  disabled={$app_state.busy}
                >
                  Apply
                </button>
              </div>
              {#if proposal.explanation_text}
                <p class="meta">{proposal.explanation_text}</p>
              {/if}
              <details>
                <summary>Details</summary>
                <pre>{JSON.stringify({ rationale: proposal.rationale, metrics: proposal.metrics }, null, 2)}</pre>
              </details>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>

  <div class="exports">
    <h3>Exports</h3>
    {#if $app_state.mode !== "server"}
      <p class="meta">Exports are available in server mode.</p>
    {:else}
      <div class="row">
        <button type="button" on:click={() => request_exports("json")} disabled={exportBusy}>
          Download specs
        </button>
        <button type="button" on:click={() => request_exports("pdf")} disabled={exportBusy}>
          Download PDF
        </button>
      </div>
      {#if exportError}
        <div class="error">{exportError}</div>
      {/if}
      {#if exportArtifacts.length > 0}
        <ul>
          {#each exportArtifacts as artifact}
            <li>
              {#if artifact.download_url}
                <a href={artifact.download_url} target="_blank" rel="noreferrer">{artifact.name}</a>
              {:else if artifact.url}
                <a href={artifact.url} target="_blank" rel="noreferrer">{artifact.name}</a>
              {:else}
                {artifact.name}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>

  {#if $app_state.mode === "server"}
    <AgentChat />
  {/if}

  <PluginsPanel />
</section>

<style>
  .panel {
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    background: #fffaf2;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .meta {
    color: #6b7280;
    font-size: 0.875rem;
  }
  .summary {
    margin-bottom: 0.75rem;
    font-weight: 600;
  }
  .controls {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .mode-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .mode-toggle label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .meta-block {
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
    color: #374151;
    display: grid;
    gap: 0.25rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
  input {
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
  }
  select {
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
    background: #fff;
  }
  button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #fef3c7;
    cursor: pointer;
  }
  button.secondary {
    background: #fef3c7;
    color: #111827;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .error {
    color: #991b1b;
    font-size: 0.9rem;
  }
  .warn {
    color: #b45309;
    font-size: 0.85rem;
  }
  .violations ul {
    padding-left: 1rem;
    margin: 0.5rem 0 0;
  }
  .violations li {
    margin-bottom: 0.5rem;
  }
  .quote {
    margin-top: 1rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
</style>

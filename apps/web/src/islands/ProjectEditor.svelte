<script lang="ts">
  import { onMount } from "svelte";
  import { app_state, init_demo, move_first_object_x, recompute, reset_demo } from "../lib/state";

  export let projectId: string | null = null;

  const defaultApiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:3001";

  let xInput = "";
  let inputError = "";
  let initialized = false;

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
    await init_demo(mode, defaultApiBaseUrl);
  }

  onMount(async () => {
    if (projectId === "demo") {
      const storedMode = localStorage.getItem("planforge_demo_mode");
      const mode = storedMode === "local" ? "local" : "server";
      await init_demo(mode, defaultApiBaseUrl);
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
  .violations ul {
    padding-left: 1rem;
    margin: 0.5rem 0 0;
  }
  .violations li {
    margin-bottom: 0.5rem;
  }
</style>

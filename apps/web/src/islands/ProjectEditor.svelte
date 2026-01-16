<script lang="ts">
  import { onMount } from "svelte";
  import { app_state, load_fixture, move_first_object_x, recompute } from "../lib/state";

  export let projectId: string | null = null;

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

  onMount(async () => {
    if (projectId === "demo") {
      await load_fixture();
    }
  });
</script>

<section class="panel">
  <header>
    <h2>Project Editor</h2>
    <p class="meta">{projectId ?? "(no id)"}</p>
  </header>

  <div class="summary">{getSummary($app_state.kitchen_state)}</div>

  {#if $app_state.error}
    <div class="error">{$app_state.error}</div>
  {/if}

  <div class="controls">
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

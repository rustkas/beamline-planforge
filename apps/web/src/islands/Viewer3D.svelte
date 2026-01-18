<script lang="ts">
  import { onMount } from "svelte";
  import type { SvelteComponent } from "svelte";

  export let render_model: unknown | null = null;
  export let render_instructions: unknown[] | null = null;
  export let selected_object_id: string | null = null;
  export let violations: Array<{ code: string; severity: string; object_ids: string[] }> | null = null;
  export let focus_object_ids: string[] | null = null;
  export let on_pick: ((object_id: string | null) => void) | null = null;

  let CanvasView: typeof SvelteComponent | null = null;
  let error = "";

  onMount(async () => {
    try {
      const mod = await import("./Viewer3DCanvas.svelte");
      CanvasView = mod.default;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load viewer";
    }
  });
</script>

{#if CanvasView}
  <svelte:component
    this={CanvasView}
    {render_model}
    render_instructions={render_instructions}
    {selected_object_id}
    {violations}
    {focus_object_ids}
    {on_pick}
  />
{:else}
  <div class="viewer-placeholder">
    {#if error}
      <div class="error">{error}</div>
    {:else}
      <div class="meta">Loading 3D viewer…</div>
    {/if}
  </div>
{/if}

<style>
  .viewer-placeholder {
    height: 420px;
    border-radius: 0.75rem;
    border: 1px dashed #e5e7eb;
    background: #f9fafb;
    display: grid;
    place-items: center;
    color: #6b7280;
  }
  .error {
    color: #991b1b;
    font-size: 0.9rem;
  }
  .meta {
    font-size: 0.9rem;
  }
</style>

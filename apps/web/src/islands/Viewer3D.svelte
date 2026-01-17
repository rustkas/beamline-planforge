<script lang="ts">
  import { onMount } from "svelte";
  import type { SvelteComponent } from "svelte";

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
  <svelte:component this={CanvasView} />
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

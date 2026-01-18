<script lang="ts">
  import Viewer3D from "../../islands/Viewer3D.svelte";

  export type Proposal = {
    proposal_id: string;
    variant_index: number;
    kind?: string;
    metrics?: Record<string, unknown>;
    explanation_text?: string;
    violations_summary?: Array<{ code: string; severity: string; count: number; message?: string }>;
  };

  export let proposals: Proposal[] = [];
  export let loading = false;
  export let error: string | null = null;
  export let appliedRevisionId: string | null = null;
  export let generatedAt: string | null = null;
  export let renderQuality: "draft" | "quality" = "draft";
  export let renderModel: unknown | null = null;
  export let renderError: string | null = null;
  export let selectedObject: {
    id: string;
    kind?: string;
    catalog_item_id?: string;
    dims_mm?: { width: number; depth: number; height: number };
    material_slots?: Record<string, string>;
  } | null = null;
  export let appliedHistory: Array<{
    time: string;
    proposal_id: string;
    kind?: string;
    revision_id: string;
    min_passage_mm?: number;
    utility_fit_score?: number;
  }> = [];
  export let canRevert = false;
  export let onGenerate: () => void;
  export let onApply: (proposalId: string) => void;
  export let onRevert: () => void;
  export let onQualityChange: (quality: "draft" | "quality") => void;
  export let onPickObject: (objectId: string | null) => void;

  function formatMetric(label: string, value: unknown): string {
    if (typeof value === "number") return `${label}: ${value}`;
    if (typeof value === "boolean") return `${label}: ${value ? "yes" : "no"}`;
    return `${label}: n/a`;
  }

  function summarizeViolations(items?: Proposal["violations_summary"]): string | null {
    if (!items || items.length === 0) return null;
    const counts = items.reduce(
      (acc, v) => {
        acc[v.severity] = (acc[v.severity] ?? 0) + v.count;
        return acc;
      },
      {} as Record<string, number>
    );
    return Object.entries(counts)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(", ");
  }
</script>

<section class="layout-step">
  <header>
    <h2>Layout options</h2>
    <p class="meta">Generate 2–3 variants with explanations, then apply one.</p>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="row">
    <button type="button" on:click={onGenerate} disabled={loading}>
      {loading ? "Generating..." : "Generate 3 options"}
    </button>
    {#if generatedAt}
      <span class="meta">Generated at {generatedAt}</span>
    {/if}
    <div class="quality">
      <span class="meta">Quality</span>
      <button
        type="button"
        class:active={renderQuality === "draft"}
        on:click={() => onQualityChange("draft")}
        disabled={loading}
      >
        Draft
      </button>
      <button
        type="button"
        class:active={renderQuality === "quality"}
        on:click={() => onQualityChange("quality")}
        disabled={loading}
      >
        Quality
      </button>
    </div>
  </div>

  {#if proposals.length === 0}
    <p class="meta">No proposals yet.</p>
  {:else}
    <div class="grid">
      {#each proposals as proposal}
        <article class="card">
          <header>
            <h3>{proposal.kind ?? `Variant ${proposal.variant_index + 1}`}</h3>
            <p class="meta">proposal_id: {proposal.proposal_id}</p>
          </header>

          <div class="metrics">
            <p>{formatMetric("Min passage", proposal.metrics?.min_passage_mm)}</p>
            <p>{formatMetric("Utility fit", proposal.metrics?.utility_fit_score)}</p>
            <p>{formatMetric("Triangle proxy", proposal.metrics?.triangle_proxy_mm)}</p>
          </div>

          {#if proposal.explanation_text}
            <p class="explain">{proposal.explanation_text}</p>
          {/if}

          {#if summarizeViolations(proposal.violations_summary)}
            <p class="warn">
              Violations: {summarizeViolations(proposal.violations_summary)}
            </p>
          {/if}

          <button type="button" on:click={() => onApply(proposal.proposal_id)} disabled={loading}>
            Apply
          </button>
        </article>
      {/each}
    </div>
  {/if}

  {#if appliedRevisionId}
    <p class="meta">Applied → revision {appliedRevisionId}</p>
  {/if}

  {#if appliedHistory.length > 0}
    <section class="history">
      <header class="row">
        <h3>Applied history</h3>
        <button type="button" on:click={onRevert} disabled={loading || !canRevert}>
          Revert to base
        </button>
      </header>
      <ul>
        {#each appliedHistory as item}
          <li>
            <strong>{item.kind ?? "variant"}</strong> — {item.time} · {item.proposal_id}
            <span class="meta">rev {item.revision_id}</span>
            {#if item.min_passage_mm !== undefined}
              <span class="meta">min passage {item.min_passage_mm}mm</span>
            {/if}
            {#if item.utility_fit_score !== undefined}
              <span class="meta">utility fit {item.utility_fit_score}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="preview">
    <header class="row">
      <h3>3D preview</h3>
      {#if renderError}
        <span class="error">{renderError}</span>
      {/if}
    </header>
    <Viewer3D
      render_model={renderModel}
      selected_object_id={selectedObject?.id ?? null}
      on_pick={onPickObject}
    />
  </section>

  {#if selectedObject}
    <section class="card">
      <h3>Selected object</h3>
      <p><strong>ID:</strong> {selectedObject.id}</p>
      {#if selectedObject.kind}
        <p><strong>Kind:</strong> {selectedObject.kind}</p>
      {/if}
      {#if selectedObject.catalog_item_id}
        <p><strong>SKU:</strong> {selectedObject.catalog_item_id}</p>
      {/if}
      {#if selectedObject.dims_mm}
        <p>
          <strong>Dims:</strong>
          {selectedObject.dims_mm.width}×{selectedObject.dims_mm.depth}×{selectedObject.dims_mm.height} mm
        </p>
      {/if}
      {#if selectedObject.material_slots}
        <details>
          <summary>Material slots</summary>
          <ul>
            {#each Object.entries(selectedObject.material_slots) as [slot, material]}
              <li>{slot}: {material}</li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  {/if}
</section>

<style>
  .layout-step {
    display: grid;
    gap: 1rem;
  }
  .row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .quality {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }
  .quality button {
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #111827;
  }
  .quality button.active {
    background: #111827;
    color: #fef3c7;
  }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 0.8rem;
    background: #fff;
    display: grid;
    gap: 0.6rem;
  }
  .metrics {
    display: grid;
    gap: 0.2rem;
    font-size: 0.9rem;
  }
  .meta {
    color: #6b7280;
  }
  .explain {
    font-size: 0.9rem;
  }
  .warn {
    color: #92400e;
  }
  .error {
    color: #991b1b;
  }
  .history {
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: #fffaf2;
    border: 1px solid #f1f5f9;
  }
  .history ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.35rem;
  }
  .preview {
    display: grid;
    gap: 0.5rem;
  }
  button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #fef3c7;
  }
</style>

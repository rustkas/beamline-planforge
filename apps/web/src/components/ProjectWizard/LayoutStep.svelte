<script lang="ts">
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
  export let onGenerate: () => void;
  export let onApply: (proposalId: string) => void;

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
  button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #fef3c7;
  }
</style>

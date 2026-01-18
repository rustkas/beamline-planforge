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

  export let wizardVariant: "A" | "B" = "A";
  export let proposals: Proposal[] = [];
  export let loading = false;
  export let error: string | null = null;
  export let appliedRevisionId: string | null = null;
  export let serverRevisionId: string | null = null;
  export let generatedAt: string | null = null;
  export let renderQuality: "draft" | "quality" = "draft";
  export let renderModel: unknown | null = null;
  export let renderError: string | null = null;
  export let renderStatus: "idle" | "loading" | "ready" | "error" = "idle";
  export let renderNodesCount: number | null = null;
  export let renderMs: number | null = null;
  export let violations: Array<{ code: string; severity: string; object_ids: string[] }> = [];
  export let focusObjectIds: string[] = [];
  export let draftDirty = false;
  export let draftError: string | null = null;
  export let selectedObject: {
    id: string;
    kind?: string;
    catalog_item_id?: string;
    dims_mm?: { width: number; depth: number; height: number };
    material_slots?: Record<string, string>;
  } | null = null;
  export let selectedObjectPosition: { x: number; y: number } | null = null;
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
  export let onRevertAppliedLocal: ((revisionId: string) => void) | null = null;
  export let onQualityChange: (quality: "draft" | "quality") => void;
  export let onPickObject: (objectId: string | null) => void;
  export let onUpdateDraftPosition: ((pos: { x: number; y: number }) => void) | null = null;
  export let onResetDraft: (() => void) | null = null;
  export let onFocusViolations: ((code: string | null) => void) | null = null;
  export let refineLoading = false;
  export let refineError: string | null = null;
  export let refinePreview:
    | {
        proposed_patch?: unknown;
        explanations?: Array<{ group: string; title: string; detail?: string }>;
        violations_summary?: Array<{ code: string; severity: string; count: number }>;
        message?: string;
      }
    | null = null;
  export let onRefinePreview: (command: string) => void;
  export let onRefineApply: (command: string) => void;

  const substeps = ["room", "zones", "objects", "rules", "review"] as const;
  type Substep = (typeof substeps)[number];
  let substepIndex = 0;
  let draftX = 0;
  let draftY = 0;
  let focusedCode: string | null = null;
  let refineCommand = "";

  $: busy = loading || renderStatus === "loading" || refineLoading;
  $: refineDisabled = busy || !appliedRevisionId;
  $: substep = (substeps[substepIndex] ?? "room") as Substep;
  $: if (wizardVariant === "B" && selectedObjectPosition) {
    draftX = selectedObjectPosition.x;
    draftY = selectedObjectPosition.y;
  }
  $: violationGroups = violations.reduce(
    (acc, v) => {
      const entry = acc.get(v.code) ?? {
        code: v.code,
        severity: v.severity,
        count: 0,
        object_ids: new Set<string>()
      };
      entry.count += 1;
      for (const id of v.object_ids ?? []) {
        entry.object_ids.add(id);
      }
      acc.set(v.code, entry);
      return acc;
    },
    new Map<string, { code: string; severity: string; count: number; object_ids: Set<string> }>()
  );

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

  function summarizeRefine(items?: Array<{ code: string; severity: string; count: number }>): string | null {
    if (!items || items.length === 0) return null;
    return items.map((item) => `${item.count} ${item.severity}`).join(", ");
  }

  function nextSubstep(): void {
    if (substepIndex < substeps.length - 1) substepIndex += 1;
  }

  function prevSubstep(): void {
    if (substepIndex > 0) substepIndex -= 1;
  }

  function applyDraftPosition(): void {
    if (!selectedObjectPosition || !onUpdateDraftPosition) return;
    if (!Number.isFinite(draftX) || !Number.isFinite(draftY)) return;
    onUpdateDraftPosition({ x: Math.round(draftX), y: Math.round(draftY) });
  }

  function handleFocus(code: string | null): void {
    const next = focusedCode === code ? null : code;
    focusedCode = next;
    onFocusViolations?.(next);
  }

  function runPreview(): void {
    if (!refineCommand.trim() || refineDisabled) return;
    onRefinePreview(refineCommand.trim());
  }

  function runApply(): void {
    if (!refineCommand.trim() || refineDisabled) return;
    onRefineApply(refineCommand.trim());
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

  {#if wizardVariant === "B"}
    <div class="substeps">
      {#each substeps as step, idx}
        <button
          type="button"
          class:active={idx === substepIndex}
          on:click={() => (substepIndex = idx)}
          disabled={busy}
        >
          {step}
        </button>
      {/each}
    </div>
    <div class="row">
      <button type="button" on:click={prevSubstep} disabled={busy || substepIndex === 0}>
        Back
      </button>
      <button
        type="button"
        on:click={nextSubstep}
        disabled={busy || substepIndex === substeps.length - 1}
      >
        Next
      </button>
      {#if draftDirty}
        <span class="meta">Draft changes</span>
      {/if}
      <button
        type="button"
        class="ghost"
        on:click={() => onResetDraft?.()}
        disabled={busy || !draftDirty}
      >
        Reset draft
      </button>
    </div>
  {/if}

  <div class="row">
    <button type="button" on:click={onGenerate} disabled={busy}>
      {busy ? "Generating..." : "Generate 3 options"}
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
        disabled={busy}
      >
        Draft
      </button>
      <button
        type="button"
        class:active={renderQuality === "quality"}
        on:click={() => onQualityChange("quality")}
        disabled={busy}
      >
        Quality
      </button>
    </div>
    {#if wizardVariant === "B" && draftDirty}
      <span class="badge">Draft • unsaved changes</span>
    {/if}
  </div>

  {#if wizardVariant === "B" && draftError}
    <p class="error">{draftError}</p>
  {/if}

  {#if wizardVariant === "B" && substep === "objects"}
    <section class="card">
      <h3>Draft edits</h3>
      {#if selectedObject}
        <p class="meta">Editing {selectedObject.id}</p>
        <div class="row">
          <label>
            X (mm)
            <input type="number" bind:value={draftX} />
          </label>
          <label>
            Y (mm)
            <input type="number" bind:value={draftY} />
          </label>
          <button type="button" on:click={applyDraftPosition} disabled={busy}>
            Update draft
          </button>
        </div>
      {:else}
        <p class="meta">Select an object in 3D to edit its position.</p>
      {/if}
    </section>
  {/if}

  {#if wizardVariant === "B" && substep === "rules"}
    <section class="card">
      <header class="row">
        <h3>Rules &amp; violations</h3>
        <button type="button" class="ghost" on:click={() => handleFocus(null)} disabled={busy}>
          Clear focus
        </button>
      </header>
      {#if violationGroups.size === 0}
        <p class="meta">No violations recorded for the applied revision yet.</p>
      {:else}
        <ul class="violations">
          {#each Array.from(violationGroups.values()) as entry}
            <li>
              <button type="button" on:click={() => handleFocus(entry.code)} disabled={busy}>
                {entry.code} · {entry.severity} · {entry.count}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if wizardVariant === "A" || substep === "review"}
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

            <button type="button" on:click={() => onApply(proposal.proposal_id)} disabled={busy}>
              Apply
            </button>
          </article>
        {/each}
      </div>
    {/if}
  {/if}

  {#if wizardVariant === "B" && substep === "review"}
    <section class="card">
      <header class="row">
        <h3>Refine with agent</h3>
        {#if refineLoading}
          <span class="meta">working…</span>
        {/if}
      </header>
      <div class="row">
        <input
          type="text"
          placeholder="move sink near window"
          bind:value={refineCommand}
          disabled={refineDisabled}
        />
        <button type="button" class="ghost" on:click={runPreview} disabled={refineDisabled}>
          Preview
        </button>
        <button type="button" on:click={runApply} disabled={refineDisabled}>
          Apply
        </button>
      </div>
      <div class="row">
        <button type="button" class="ghost" on:click={() => (refineCommand = "move sink near window")} disabled={refineDisabled}>
          move sink near window
        </button>
        <button type="button" class="ghost" on:click={() => (refineCommand = "move hob near vent")} disabled={refineDisabled}>
          move hob near vent
        </button>
        <button type="button" class="ghost" on:click={() => (refineCommand = "increase passage")} disabled={refineDisabled}>
          increase passage
        </button>
        <button type="button" class="ghost" on:click={() => (refineCommand = "remove upper cabinets")} disabled={refineDisabled}>
          remove upper cabinets
        </button>
      </div>
      {#if refineError}
        <p class="error">{refineError}</p>
      {/if}
      {#if refinePreview}
        <div class="preview-box">
          {#if refinePreview.message}
            <p class="meta">{refinePreview.message}</p>
          {/if}
          {#if refinePreview.explanations}
            <ul>
              {#each refinePreview.explanations as exp}
                <li>
                  <strong>{exp.group}</strong> — {exp.title}
                  {#if exp.detail}
                    <span class="meta">· {exp.detail}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if summarizeRefine(refinePreview.violations_summary)}
            <p class="warn">Violations: {summarizeRefine(refinePreview.violations_summary)}</p>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  {#if appliedRevisionId}
    <p class="meta">Applied → revision {appliedRevisionId}</p>
    {#if wizardVariant === "B" && serverRevisionId && appliedRevisionId !== serverRevisionId}
      <p class="warn">Local preview (not synced). Apply a proposal to update the server revision.</p>
    {/if}
  {/if}

  {#if appliedHistory.length > 0}
    <section class="history">
      <header class="row">
        <h3>Applied history</h3>
        <button type="button" on:click={onRevert} disabled={busy || !canRevert}>
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
            {#if wizardVariant === "B" && onRevertAppliedLocal}
              <button
                type="button"
                class="ghost"
                on:click={() => onRevertAppliedLocal?.(item.revision_id)}
                disabled={busy}
              >
                Revert
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="preview">
    <header class="row">
      <h3>3D preview</h3>
      <span class="meta">
        {#if renderNodesCount !== null}
          nodes: {renderNodesCount}
        {:else}
          nodes: –
        {/if}
        {#if renderMs !== null}
          · {renderMs}ms
        {/if}
        · {renderQuality}
      </span>
      {#if renderStatus === "loading"}
        <span class="meta">loading…</span>
      {:else if renderStatus === "error"}
        <span class="error">render error</span>
      {/if}
    </header>
    <div class="viewer-shell">
      <Viewer3D
        render_model={renderModel}
        selected_object_id={selectedObject?.id ?? null}
        focus_object_ids={focusObjectIds}
        on_pick={onPickObject}
        {violations}
      />
      {#if renderStatus === "loading"}
        <div class="viewer-overlay">
          <div class="skeleton" />
          <div class="meta">Rendering preview…</div>
        </div>
      {/if}
      {#if renderStatus === "error" && renderError}
        <div class="viewer-overlay error">{renderError}</div>
      {/if}
    </div>
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
  .substeps {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .substeps button {
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #111827;
    font-size: 0.85rem;
  }
  .substeps button.active {
    background: #111827;
    color: #fef3c7;
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
  .badge {
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid #f59e0b;
    background: #fff7ed;
    color: #92400e;
    font-size: 0.75rem;
  }
  .ghost {
    background: #fff;
    color: #111827;
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
  .violations {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
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
  .preview-box {
    border-radius: 0.6rem;
    background: #f8fafc;
    padding: 0.6rem;
    display: grid;
    gap: 0.4rem;
  }
  .preview {
    display: grid;
    gap: 0.5rem;
  }
  .viewer-shell {
    position: relative;
  }
  .viewer-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(2px);
    color: #111827;
    font-size: 0.9rem;
  }
  .viewer-overlay.error {
    color: #991b1b;
  }
  .skeleton {
    width: 70%;
    height: 60%;
    border-radius: 1rem;
    background: linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%);
    animation: shimmer 1.4s infinite;
  }
  @keyframes shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: 200px 0;
    }
  }
  button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #fef3c7;
  }
  input {
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
  }
</style>

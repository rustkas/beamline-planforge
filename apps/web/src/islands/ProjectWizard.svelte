<script lang="ts">
  import { onMount } from "svelte";
  import { load_kitchen_state_fixture } from "../lib/fixtures";
  import { create_api_core_client } from "../lib/api_core_client";
  import { create_ai_orchestrator_client } from "../lib/ai_orchestrator_client";
  import LayoutStep from "../components/ProjectWizard/LayoutStep.svelte";

  const apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const api = create_api_core_client(apiBaseUrl);
  const orchestratorBaseUrl = import.meta.env.PUBLIC_ORCHESTRATOR_BASE_URL ?? "http://localhost:3002";
  const orchestrator = create_ai_orchestrator_client(orchestratorBaseUrl);

  const steps = ["room", "style", "layout", "materials", "quote", "checkout"] as const;
  type Step = (typeof steps)[number];

  let stepIndex = 0;
  let kitchenState: any = null;
  let loading = false;
  let error: string | null = null;

  let roomWidth = 3200;
  let roomDepth = 2600;
  let roomHeight = 2700;
  const wallIds = ["north", "east", "south", "west"];
  type OpeningForm = {
    id: string;
    kind: "door" | "window";
    wall_id: string;
    offset_mm: number;
    width_mm: number;
    height_mm: number;
    sill_height_mm: number;
    swing_direction: "left" | "right" | "both";
    swing_radius_mm: number;
  };
  type UtilityForm = {
    id: string;
    kind: "water" | "drain" | "power" | "vent" | "gas";
    placement: "wall" | "point";
    wall_id: string;
    offset_mm: number;
    position_x: number;
    position_y: number;
    zone_radius_mm: number;
  };
  let openings: OpeningForm[] = [];
  let utilities: UtilityForm[] = [];
  let style = "modern";
  let layout = "linear";
  let material = "oak";

  let projectId: string | null = null;
  let revisionId: string | null = null;
  let quote: any = null;
  let orderId: string | null = null;
  let sessionId: string | null = null;
  let proposals: Array<{
    proposal_id: string;
    variant_index: number;
    kind?: string;
    metrics?: Record<string, unknown>;
    explanation_text?: string;
    violations_summary?: Array<{ code: string; severity: string; count: number; message?: string }>;
  }> = [];
  let proposalsGeneratedAt: string | null = null;
  let layoutLoading = false;
  let layoutError: string | null = null;
  let appliedRevisionId: string | null = null;
  let quoteDebounce: ReturnType<typeof setTimeout> | null = null;
  let renderModel: unknown | null = null;
  let renderQuality: "draft" | "quality" = "draft";
  let renderError: string | null = null;
  let selectedObjectId: string | null = null;
  let baseRevisionId: string | null = null;
  let appliedHistory: Array<{
    time: string;
    proposal_id: string;
    kind?: string;
    revision_id: string;
    min_passage_mm?: number;
    utility_fit_score?: number;
  }> = [];

  let customerName = "";
  let customerEmail = "";
  let customerPhone = "";
  let deliveryLine1 = "";
  let deliveryCity = "";
  let deliveryCountry = "";

  function storageKey(projectId: string): string {
    return `planforge_project::${projectId}`;
  }

  function appliedKey(projectId: string): string {
    return `planforge_wizard_applied::${projectId}`;
  }

  function baseKey(projectId: string): string {
    return `planforge_wizard_base::${projectId}`;
  }

  function currentStep(): Step {
    return steps[stepIndex] ?? "room";
  }

  function openingValid(opening: OpeningForm): boolean {
    if (!opening.id.trim()) return false;
    if (!wallIds.includes(opening.wall_id)) return false;
    const wallLength =
      opening.wall_id === "north" || opening.wall_id === "south" ? roomWidth : roomDepth;
    const swingDepth =
      opening.wall_id === "north" || opening.wall_id === "south" ? roomDepth : roomWidth;
    if (opening.offset_mm < 0 || opening.width_mm <= 0 || opening.height_mm <= 0) return false;
    if (opening.width_mm > wallLength) return false;
    if (opening.offset_mm + opening.width_mm > wallLength) return false;
    if (opening.height_mm > roomHeight) return false;
    if (opening.kind === "window") {
      if (opening.sill_height_mm < 0) return false;
      if (opening.sill_height_mm + opening.height_mm > roomHeight) return false;
    }
    if (opening.kind === "door") {
      if (opening.swing_radius_mm < 0) return false;
      if (opening.swing_radius_mm > swingDepth) return false;
    }
    return true;
  }

  function utilityValid(util: UtilityForm): boolean {
    if (!util.id.trim()) return false;
    if (util.zone_radius_mm < 0) return false;
    if (util.placement === "wall") {
      if (!wallIds.includes(util.wall_id)) return false;
      if (util.offset_mm < 0) return false;
      const wallLength = util.wall_id === "north" || util.wall_id === "south" ? roomWidth : roomDepth;
      if (util.offset_mm > wallLength) return false;
    } else {
      if (util.position_x < 0 || util.position_y < 0) return false;
      if (util.position_x > roomWidth || util.position_y > roomDepth) return false;
    }
    return true;
  }

  function roomStepValid(): boolean {
    if (roomWidth <= 0 || roomDepth <= 0 || roomHeight <= 0) return false;
    if (openings.some((o) => !openingValid(o))) return false;
    if (utilities.some((u) => !utilityValid(u))) return false;
    return true;
  }

  function next(): void {
    if (stepIndex < steps.length - 1) stepIndex += 1;
  }

  function back(): void {
    if (stepIndex > 0) stepIndex -= 1;
  }

  function updateState(): void {
    if (!kitchenState) return;
    kitchenState.room.size_mm.width = roomWidth;
    kitchenState.room.size_mm.depth = roomDepth;
    kitchenState.room.size_mm.height = roomHeight;
    kitchenState.room.openings = openings.map((o) => ({
      id: o.id,
      kind: o.kind,
      wall_id: o.wall_id,
      offset_mm: o.offset_mm,
      width_mm: o.width_mm,
      height_mm: o.height_mm,
      sill_height_mm: o.sill_height_mm,
      ...(o.kind === "door"
        ? {
            swing: {
              direction: o.swing_direction,
              radius_mm: o.swing_radius_mm
            }
          }
        : {})
    }));
    kitchenState.room.utilities = utilities.map((u) => ({
      id: u.id,
      kind: u.kind,
      zone_radius_mm: u.zone_radius_mm,
      ...(u.placement === "wall"
        ? { wall_id: u.wall_id, offset_mm: u.offset_mm }
        : { position_mm: { x: u.position_x, y: u.position_y } })
    }));
    kitchenState.extensions = kitchenState.extensions ?? {};
    kitchenState.extensions.wizard = {
      style,
      layout,
      material
    };
  }

  async function ensureSession(): Promise<void> {
    if (!projectId || !revisionId) return;
    if (sessionId) return;
    const created = await api.create_session(projectId, revisionId);
    if (!created.ok) {
      layoutError = created.error.message;
      return;
    }
    sessionId = created.data.session_id;
  }

  async function generateLayoutProposals(): Promise<void> {
    layoutError = null;
    layoutLoading = true;
    await ensureProject();
    await ensureSession();
    if (!sessionId) {
      layoutLoading = false;
      return;
    }
    const res = await orchestrator.generate_proposals(sessionId);
    layoutLoading = false;
    if (!res.ok) {
      layoutError = res.error.message;
      return;
    }
    proposals = res.data.proposals.map((p) => ({
      proposal_id: p.proposal_id,
      variant_index: p.variant_index,
      kind: (p.rationale as any)?.layout_kind ?? undefined,
      metrics: p.metrics,
      explanation_text: p.explanation_text,
      violations_summary: p.violations_summary
    }));
    proposalsGeneratedAt = new Date().toLocaleTimeString();
  }

  async function refreshRender(): Promise<void> {
    if (!projectId || !revisionId) return;
    renderError = null;
    const res = await api.render(projectId, revisionId, renderQuality);
    if (!res.ok) {
      renderError = res.error.message;
      return;
    }
    renderModel = res.data;
  }

  async function applyLayoutProposal(proposalId: string): Promise<void> {
    layoutError = null;
    layoutLoading = true;
    if (!sessionId) {
      layoutError = "Session not ready.";
      layoutLoading = false;
      return;
    }
    const res = await api.select_proposal(sessionId, proposalId);
    layoutLoading = false;
    if (!res.ok) {
      layoutError = res.error.message;
      return;
    }
    appliedRevisionId = res.data.new_revision_id;
    revisionId = res.data.new_revision_id;
    if (projectId) {
      const historyEntry = proposals.find((p) => p.proposal_id === proposalId);
      appliedHistory = [
        ...appliedHistory,
        {
          time: new Date().toLocaleTimeString(),
          proposal_id: proposalId,
          kind: historyEntry?.kind,
          revision_id: res.data.new_revision_id,
          min_passage_mm: (historyEntry?.metrics as any)?.min_passage_mm,
          utility_fit_score: (historyEntry?.metrics as any)?.utility_fit_score
        }
      ];
      localStorage.setItem(appliedKey(projectId), JSON.stringify(appliedHistory));
    }
    if (projectId && revisionId) {
      const next = await api.get_revision(projectId, revisionId);
      if (next.ok) {
        kitchenState = next.data.kitchen_state;
      }
      await refreshRender();
      scheduleQuoteRefresh();
    }
  }

  function scheduleQuoteRefresh(): void {
    if (!projectId || !revisionId) return;
    if (quoteDebounce) {
      clearTimeout(quoteDebounce);
    }
    quoteDebounce = setTimeout(async () => {
      await fetchQuote();
    }, 400);
  }

  async function revertToBase(): Promise<void> {
    if (!projectId || !baseRevisionId || !sessionId) return;
    layoutError = null;
    layoutLoading = true;
    const res = await api.advance_session(sessionId, baseRevisionId);
    layoutLoading = false;
    if (!res.ok) {
      layoutError = res.error.message;
      return;
    }
    revisionId = baseRevisionId;
    appliedRevisionId = baseRevisionId;
    selectedObjectId = null;
    await refreshRender();
    scheduleQuoteRefresh();
  }

  async function changeQuality(nextQuality: "draft" | "quality"): Promise<void> {
    renderQuality = nextQuality;
    await refreshRender();
  }

  function handlePick(objectId: string | null): void {
    selectedObjectId = objectId;
  }

  function addOpening(kind: "door" | "window"): void {
    const baseId = `${kind}_${openings.length + 1}`;
    openings = [
      ...openings,
      {
        id: baseId,
        kind,
        wall_id: "south",
        offset_mm: 0,
        width_mm: kind === "door" ? 900 : 1200,
        height_mm: kind === "door" ? 2100 : 1200,
        sill_height_mm: kind === "door" ? 0 : 900,
        swing_direction: "left",
        swing_radius_mm: 900
      }
    ];
  }

  function removeOpening(id: string): void {
    openings = openings.filter((o) => o.id !== id);
  }

  function addUtility(kind: UtilityForm["kind"]): void {
    const baseId = `${kind}_${utilities.length + 1}`;
    utilities = [
      ...utilities,
      {
        id: baseId,
        kind,
        placement: "wall",
        wall_id: "south",
        offset_mm: 0,
        position_x: 0,
        position_y: 0,
        zone_radius_mm: 200
      }
    ];
  }

  function removeUtility(id: string): void {
    utilities = utilities.filter((u) => u.id !== id);
  }

  function applyTemplate(template: "studio" | "onebr" | "lshape"): void {
    if (template === "studio") {
      roomWidth = 2600;
      roomDepth = 2200;
      roomHeight = 2600;
    } else if (template === "onebr") {
      roomWidth = 3200;
      roomDepth = 2600;
      roomHeight = 2700;
    } else {
      roomWidth = 3600;
      roomDepth = 2800;
      roomHeight = 2700;
    }
  }

  function planScale(): number {
    const maxSide = Math.max(roomWidth, roomDepth, 1);
    return 260 / maxSide;
  }

  function wallPoint(wallId: string, offset: number): { x: number; y: number } {
    const scale = planScale();
    if (wallId === "north") return { x: offset * scale, y: 0 };
    if (wallId === "south") return { x: offset * scale, y: roomDepth * scale };
    if (wallId === "west") return { x: 0, y: offset * scale };
    if (wallId === "east") return { x: roomWidth * scale, y: offset * scale };
    return { x: 0, y: 0 };
  }

  async function ensureProject(): Promise<void> {
    if (!kitchenState) return;
    if (projectId && revisionId) return;
    updateState();
    loading = true;
    error = null;
    const created = await api.create_project(kitchenState);
    loading = false;
    if (!created.ok) {
      error = created.error.message;
      return;
    }
    projectId = created.data.project_id;
    revisionId = created.data.revision_id;
    if (!baseRevisionId) {
      baseRevisionId = created.data.revision_id;
      localStorage.setItem(baseKey(projectId), baseRevisionId);
    }
    localStorage.setItem(storageKey(projectId), JSON.stringify({ revision_id: revisionId }));
    const storedHistory = localStorage.getItem(appliedKey(projectId));
    if (storedHistory) {
      try {
        appliedHistory = JSON.parse(storedHistory) as typeof appliedHistory;
      } catch {
        appliedHistory = [];
      }
    }
  }

  async function fetchQuote(): Promise<void> {
    if (!projectId || !revisionId) return;
    loading = true;
    error = null;
    const res = await api.create_quote(projectId, revisionId);
    loading = false;
    if (!res.ok) {
      error = res.error.message;
      return;
    }
    quote = res.data;
  }

  async function placeOrder(): Promise<void> {
    if (!projectId || !revisionId || !quote) return;
    if (!customerName || !customerEmail || !deliveryLine1 || !deliveryCity || !deliveryCountry) {
      error = "Fill all required fields.";
      return;
    }
    loading = true;
    error = null;
    const res = await api.create_order({
      project_id: projectId,
      revision_id: revisionId,
      quote_id: quote.quote_id,
      customer: { name: customerName, email: customerEmail, phone: customerPhone || undefined },
      delivery: { line1: deliveryLine1, city: deliveryCity, country: deliveryCountry }
    });
    loading = false;
    if (!res.ok) {
      error = res.error.message;
      return;
    }
    orderId = res.data.order_id;
  }

  onMount(async () => {
    kitchenState = await load_kitchen_state_fixture();
    roomWidth = kitchenState.room.size_mm.width;
    roomDepth = kitchenState.room.size_mm.depth;
    roomHeight = kitchenState.room.size_mm.height;
    openings = (kitchenState.room.openings ?? []).map((o: any) => ({
      id: o.id ?? `opening_${Math.random().toString(36).slice(2, 6)}`,
      kind: o.kind ?? "door",
      wall_id: o.wall_id ?? "south",
      offset_mm: o.offset_mm ?? 0,
      width_mm: o.width_mm ?? 900,
      height_mm: o.height_mm ?? 2100,
      sill_height_mm: o.sill_height_mm ?? 0,
      swing_direction: o.swing?.direction ?? "left",
      swing_radius_mm: o.swing?.radius_mm ?? 900
    }));
    utilities = (kitchenState.room.utilities ?? []).map((u: any) => ({
      id: u.id ?? `util_${Math.random().toString(36).slice(2, 6)}`,
      kind: u.kind ?? "water",
      placement: u.wall_id ? "wall" : "point",
      wall_id: u.wall_id ?? "south",
      offset_mm: u.offset_mm ?? 0,
      position_x: u.position_mm?.x ?? 0,
      position_y: u.position_mm?.y ?? 0,
      zone_radius_mm: u.zone_radius_mm ?? 200
    }));
    if (projectId) {
      const storedBase = localStorage.getItem(baseKey(projectId));
      if (storedBase) baseRevisionId = storedBase;
    }
  });

  $: selectedObject = (() => {
    if (!kitchenState || !selectedObjectId) return null;
    const objects = (kitchenState as any)?.layout?.objects;
    if (!Array.isArray(objects)) return null;
    const found = objects.find((obj: any) => obj.id === selectedObjectId);
    if (!found) return null;
    return {
      id: found.id,
      kind: found.kind,
      catalog_item_id: found.catalog_item_id,
      dims_mm: found.dims_mm,
      material_slots: found.material_slots
    };
  })();
</script>

<section class="wizard">
  <header>
    <h1>New Kitchen Project</h1>
    <p class="meta">Step {stepIndex + 1} / {steps.length} — {currentStep()}</p>
  </header>

  <nav class="steps">
    {#each steps as step, index}
      <button
        class:active={index === stepIndex}
        on:click={() => (stepIndex = index)}
        type="button"
      >
        {index + 1}. {step}
      </button>
    {/each}
  </nav>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if currentStep() === "room"}
    <div class="panel">
      <h2>Room</h2>
      <div class="templates">
        <button type="button" on:click={() => applyTemplate("studio")}>Studio</button>
        <button type="button" on:click={() => applyTemplate("onebr")}>1BR</button>
        <button type="button" on:click={() => applyTemplate("lshape")}>L-shape zone</button>
      </div>
      <label>Width (mm)<input type="number" bind:value={roomWidth} /></label>
      <label>Depth (mm)<input type="number" bind:value={roomDepth} /></label>
      <label>Height (mm)<input type="number" bind:value={roomHeight} /></label>
      {#if !roomStepValid()}
        <p class="error">Fill valid room dimensions, openings, and utilities before continuing.</p>
      {/if}
      <div class="subpanel">
        <h3>2D Plan</h3>
        <svg class="plan" viewBox={`0 0 ${roomWidth * planScale()} ${roomDepth * planScale()}`}>
          <rect
            x="0"
            y="0"
            width={roomWidth * planScale()}
            height={roomDepth * planScale()}
            rx="6"
          />
          {#each openings as opening}
            {#if opening.wall_id === "north" || opening.wall_id === "south"}
              <rect
                class:door={opening.kind === "door"}
                x={wallPoint(opening.wall_id, opening.offset_mm).x}
                y={opening.wall_id === "north" ? 0 : roomDepth * planScale() - 6}
                width={opening.width_mm * planScale()}
                height="6"
              />
            {:else}
              <rect
                class:door={opening.kind === "door"}
                x={opening.wall_id === "west" ? 0 : roomWidth * planScale() - 6}
                y={wallPoint(opening.wall_id, opening.offset_mm).y}
                width="6"
                height={opening.width_mm * planScale()}
              />
            {/if}
          {/each}
          {#each utilities as util}
            {#if util.placement === "wall"}
              {#key util.id}
                <circle
                  class="util"
                  cx={wallPoint(util.wall_id, util.offset_mm).x}
                  cy={wallPoint(util.wall_id, util.offset_mm).y}
                  r="4"
                />
              {/key}
            {:else}
              <circle
                class="util"
                cx={util.position_x * planScale()}
                cy={util.position_y * planScale()}
                r="4"
              />
            {/if}
          {/each}
        </svg>
        <p class="meta">Simple wall-aligned preview (not to scale for doors swing).</p>
      </div>
      <div class="subpanel">
        <h3>Openings</h3>
        <div class="row">
          <button type="button" on:click={() => addOpening("door")}>Add door</button>
          <button type="button" on:click={() => addOpening("window")}>Add window</button>
        </div>
        {#if openings.length === 0}
          <p class="meta">No openings yet.</p>
        {:else}
          {#each openings as opening}
            <div class="card">
              <div class="row">
                <strong>{opening.id}</strong>
                <button type="button" on:click={() => removeOpening(opening.id)}>Remove</button>
              </div>
              <label>Type
                <select bind:value={opening.kind}>
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </select>
              </label>
              <label>Wall
                <select bind:value={opening.wall_id}>
                  {#each wallIds as wall}
                    <option value={wall}>{wall}</option>
                  {/each}
                </select>
              </label>
              <label>Offset (mm)<input type="number" bind:value={opening.offset_mm} /></label>
              <label>Width (mm)<input type="number" bind:value={opening.width_mm} /></label>
              <label>Height (mm)<input type="number" bind:value={opening.height_mm} /></label>
              <label>Sill height (mm)<input type="number" bind:value={opening.sill_height_mm} /></label>
              {#if opening.kind === "door"}
                <label>Swing direction
                  <select bind:value={opening.swing_direction}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="both">Both</option>
                  </select>
                </label>
                <label>Swing radius (mm)<input type="number" bind:value={opening.swing_radius_mm} /></label>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
      <div class="subpanel">
        <h3>Utilities</h3>
        <div class="row">
          <button type="button" on:click={() => addUtility("water")}>Add water</button>
          <button type="button" on:click={() => addUtility("drain")}>Add drain</button>
          <button type="button" on:click={() => addUtility("power")}>Add power</button>
          <button type="button" on:click={() => addUtility("vent")}>Add vent</button>
        </div>
        {#if utilities.length === 0}
          <p class="meta">No utilities yet.</p>
        {:else}
          {#each utilities as util}
            <div class="card">
              <div class="row">
                <strong>{util.id}</strong>
                <button type="button" on:click={() => removeUtility(util.id)}>Remove</button>
              </div>
              <label>Kind
                <select bind:value={util.kind}>
                  <option value="water">Water</option>
                  <option value="drain">Drain</option>
                  <option value="power">Power</option>
                  <option value="vent">Vent</option>
                  <option value="gas">Gas</option>
                </select>
              </label>
              <label>Placement
                <select bind:value={util.placement}>
                  <option value="wall">Wall</option>
                  <option value="point">Point</option>
                </select>
              </label>
              {#if util.placement === "wall"}
                <label>Wall
                  <select bind:value={util.wall_id}>
                    {#each wallIds as wall}
                      <option value={wall}>{wall}</option>
                    {/each}
                  </select>
                </label>
                <label>Offset (mm)<input type="number" bind:value={util.offset_mm} /></label>
              {:else}
                <label>X (mm)<input type="number" bind:value={util.position_x} /></label>
                <label>Y (mm)<input type="number" bind:value={util.position_y} /></label>
              {/if}
              <label>Zone radius (mm)<input type="number" bind:value={util.zone_radius_mm} /></label>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {:else if currentStep() === "style"}
    <div class="panel">
      <h2>Style</h2>
      <select bind:value={style}>
        <option value="modern">Modern</option>
        <option value="classic">Classic</option>
        <option value="industrial">Industrial</option>
      </select>
    </div>
  {:else if currentStep() === "layout"}
    <div class="panel">
      <LayoutStep
        proposals={proposals}
        loading={layoutLoading}
        error={layoutError}
        generatedAt={proposalsGeneratedAt}
        appliedRevisionId={appliedRevisionId}
        appliedHistory={appliedHistory}
        renderModel={renderModel}
        renderQuality={renderQuality}
        renderError={renderError}
        selectedObject={selectedObject}
        canRevert={!!baseRevisionId}
        onGenerate={generateLayoutProposals}
        onApply={applyLayoutProposal}
        onRevert={revertToBase}
        onQualityChange={changeQuality}
        onPickObject={handlePick}
      />
      {#if quote}
        <div class="quote">
          <p><strong>Current quote:</strong> {quote.total.amount} {quote.total.currency}</p>
        </div>
      {/if}
    </div>
  {:else if currentStep() === "materials"}
    <div class="panel">
      <h2>Materials</h2>
      <select bind:value={material}>
        <option value="oak">Oak</option>
        <option value="white">White matte</option>
        <option value="graphite">Graphite</option>
      </select>
    </div>
  {:else if currentStep() === "quote"}
    <div class="panel">
      <h2>Quote</h2>
      <button on:click={async () => { await ensureProject(); await fetchQuote(); }} disabled={loading}>
        Generate quote
      </button>
      {#if quote}
        <div class="quote">
          <p><strong>Total:</strong> {quote.total.amount} {quote.total.currency}</p>
          <details>
            <summary>Items ({quote.items.length})</summary>
            <ul>
              {#each quote.items as item}
                <li>{item.title} — {item.amount.amount} {item.amount.currency}</li>
              {/each}
            </ul>
          </details>
        </div>
      {/if}
    </div>
  {:else if currentStep() === "checkout"}
    <div class="panel">
      <h2>Checkout</h2>
      {#if orderId}
        <div class="frozen">
          <p>Order confirmed: <strong>{orderId}</strong></p>
          <p>Project: {projectId}</p>
        </div>
      {:else}
        <label>Name<input type="text" bind:value={customerName} /></label>
        <label>Email<input type="email" bind:value={customerEmail} /></label>
        <label>Phone<input type="text" bind:value={customerPhone} /></label>
        <label>Address line<input type="text" bind:value={deliveryLine1} /></label>
        <label>City<input type="text" bind:value={deliveryCity} /></label>
        <label>Country<input type="text" bind:value={deliveryCountry} /></label>
        <button on:click={placeOrder} disabled={loading || !quote}>
          Place order
        </button>
        {#if !quote}
          <p class="meta">Generate a quote first.</p>
        {/if}
      {/if}
    </div>
  {/if}

  <footer class="actions">
    <button on:click={back} disabled={stepIndex === 0 || loading}>Back</button>
    <button
      on:click={() => {
        updateState();
        next();
      }}
      disabled={
        (currentStep() === "room" && !roomStepValid()) ||
        (currentStep() === "layout" && !appliedRevisionId) ||
        stepIndex >= steps.length - 1 ||
        loading
      }
    >
      Next
    </button>
  </footer>
</section>

<style>
  .wizard {
    display: grid;
    gap: 1rem;
    max-width: 720px;
    margin: 2rem auto;
    padding: 1.5rem;
    background: #fffaf2;
    border: 1px solid #e5e7eb;
    border-radius: 1rem;
  }
  .meta {
    color: #6b7280;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .steps button {
    border: 1px solid #d1d5db;
    background: #fff;
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
  }
  .steps button.active {
    background: #111827;
    color: #fef3c7;
  }
  .panel {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border-radius: 0.75rem;
    border: 1px solid #f1f5f9;
    background: #fff;
  }
  .subpanel {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: 1px dashed #e5e7eb;
    background: #fffaf2;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .card {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    background: #ffffff;
  }
  .templates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .plan {
    width: 100%;
    max-width: 320px;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: #fffdf7;
  }
  .plan rect {
    fill: none;
    stroke: #111827;
    stroke-width: 2;
  }
  .plan rect.door {
    fill: #fbbf24;
    stroke: #b45309;
  }
  .plan .util {
    fill: #1d4ed8;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
  input,
  select {
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .actions button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #fef3c7;
  }
  .actions button:disabled {
    opacity: 0.6;
  }
  .error {
    color: #991b1b;
  }
  .frozen {
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: #fef3c7;
  }
</style>

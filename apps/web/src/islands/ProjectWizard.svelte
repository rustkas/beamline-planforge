<script lang="ts">
  import { onMount } from "svelte";
  import { load_kitchen_state_fixture } from "../lib/fixtures";
  import { create_api_core_client } from "../lib/api_core_client";

  const apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const api = create_api_core_client(apiBaseUrl);

  const steps = ["room", "style", "layout", "materials", "quote", "checkout"] as const;
  type Step = (typeof steps)[number];

  let stepIndex = 0;
  let kitchenState: any = null;
  let loading = false;
  let error: string | null = null;

  let roomWidth = 3200;
  let roomDepth = 2600;
  let roomHeight = 2700;
  let style = "modern";
  let layout = "linear";
  let material = "oak";

  let projectId: string | null = null;
  let revisionId: string | null = null;
  let quote: any = null;
  let orderId: string | null = null;

  let customerName = "";
  let customerEmail = "";
  let customerPhone = "";
  let deliveryLine1 = "";
  let deliveryCity = "";
  let deliveryCountry = "";

  function storageKey(projectId: string): string {
    return `planforge_project::${projectId}`;
  }

  function currentStep(): Step {
    return steps[stepIndex] ?? "room";
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
    kitchenState.extensions = kitchenState.extensions ?? {};
    kitchenState.extensions.wizard = {
      style,
      layout,
      material
    };
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
    localStorage.setItem(storageKey(projectId), JSON.stringify({ revision_id: revisionId }));
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
  });
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
      <label>Width (mm)<input type="number" bind:value={roomWidth} /></label>
      <label>Depth (mm)<input type="number" bind:value={roomDepth} /></label>
      <label>Height (mm)<input type="number" bind:value={roomHeight} /></label>
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
      <h2>Layout</h2>
      <select bind:value={layout}>
        <option value="linear">Linear</option>
        <option value="l-shape">L-shape</option>
        <option value="u-shape">U-shape</option>
        <option value="island">Island</option>
      </select>
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
    <button on:click={() => { updateState(); next(); }} disabled={stepIndex >= steps.length - 1 || loading}>
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

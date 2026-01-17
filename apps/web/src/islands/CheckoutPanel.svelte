<script lang="ts">
  import { onMount } from "svelte";
  import { create_api_core_client } from "../lib/api_core_client";

  export let projectId: string;

  const apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const api = create_api_core_client(apiBaseUrl);

  let revisionId: string | null = null;
  let quote: any = null;
  let order: any = null;
  let loading = false;
  let error: string | null = null;

  let customerName = "";
  let customerEmail = "";
  let customerPhone = "";
  let deliveryLine1 = "";
  let deliveryCity = "";
  let deliveryCountry = "";

  function storageKey(projectId: string): string {
    return `planforge_project::${projectId}`;
  }

  async function loadRevision(): Promise<void> {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { revision_id?: string };
      if (parsed.revision_id) revisionId = parsed.revision_id;
    } catch {
      revisionId = null;
    }
  }

  async function loadQuote(): Promise<void> {
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
    order = res.data;
  }

  onMount(async () => {
    await loadRevision();
    if (revisionId) {
      await loadQuote();
    }
  });
</script>

<section class="checkout">
  <header>
    <h1>Checkout</h1>
    <p class="meta">Project {projectId}</p>
  </header>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if !revisionId}
    <p class="meta">Revision not found. Create a project first.</p>
  {:else}
    {#if quote}
      <div class="panel">
        <h2>Quote</h2>
        <p><strong>Total:</strong> {quote.total.amount} {quote.total.currency}</p>
      </div>
    {:else}
      <button on:click={loadQuote} disabled={loading}>Load quote</button>
    {/if}

    <div class="panel">
      <h2>Order</h2>
      {#if order}
        <div class="frozen">
          <p>Order confirmed: <strong>{order.order_id}</strong></p>
          <p>Status: {order.status}</p>
        </div>
      {:else}
        <label>Name<input type="text" bind:value={customerName} /></label>
        <label>Email<input type="email" bind:value={customerEmail} /></label>
        <label>Phone<input type="text" bind:value={customerPhone} /></label>
        <label>Address line<input type="text" bind:value={deliveryLine1} /></label>
        <label>City<input type="text" bind:value={deliveryCity} /></label>
        <label>Country<input type="text" bind:value={deliveryCountry} /></label>
        <button on:click={placeOrder} disabled={loading || !quote}>Place order</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .checkout {
    max-width: 640px;
    margin: 2rem auto;
    padding: 1.5rem;
    border-radius: 1rem;
    border: 1px solid #e5e7eb;
    background: #fffaf2;
    display: grid;
    gap: 1rem;
  }
  .meta {
    color: #6b7280;
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
  }
  .frozen {
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: #fef3c7;
  }
  .error {
    color: #991b1b;
  }
</style>

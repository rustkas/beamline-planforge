<script lang="ts">
  import { app_state, run_agent_command } from "../lib/state";

  let command = "";
  let localError = "";

  async function send(): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed) return;
    localError = "";
    command = "";

    const result = await run_agent_command(trimmed);
    if (!result) {
      localError = $app_state.error ?? "Agent command failed";
      return;
    }
  }

  function useExample(value: string): void {
    command = value;
  }
</script>

<section class="chat">
  <header>
    <h3>Agent Chat</h3>
    <p class="meta">Server mode only</p>
  </header>

  <div class="examples">
    <button type="button" on:click={() => useExample("move first object x to 1200")}>Move to 1200</button>
    <button type="button" on:click={() => useExample("move first object x by -200")}>Move by -200</button>
  </div>

  <div class="messages">
    {#if $app_state.session_messages.length === 0}
      <p class="meta">No messages yet.</p>
    {:else}
      {#each $app_state.session_messages as msg}
        <div class={`msg ${msg.role}`}>{msg.content}</div>
      {/each}
    {/if}
  </div>

  <div class="input">
    <input
      type="text"
      placeholder="Type a command..."
      bind:value={command}
      on:keydown={(e) => e.key === "Enter" && send()}
      disabled={$app_state.busy}
    />
    <button on:click={send} disabled={$app_state.busy}>Send</button>
  </div>

  {#if localError}
    <div class="error">{localError}</div>
  {/if}
</section>

<style>
  .chat {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed #e5e7eb;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .examples {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .examples button {
    background: #fef3c7;
    color: #111827;
    border: 1px solid #f59e0b;
  }
  .messages {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 0.75rem;
    max-height: 180px;
    overflow: auto;
  }
  .msg {
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }
  .msg.user {
    font-weight: 600;
  }
  .msg.assistant {
    color: #374151;
  }
  .input {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .input input {
    flex: 1;
    padding: 0.45rem 0.6rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
  }
  .input button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #fef3c7;
  }
  .meta {
    color: #6b7280;
    font-size: 0.85rem;
  }
  .error {
    margin-top: 0.5rem;
    color: #991b1b;
    font-size: 0.85rem;
  }
</style>

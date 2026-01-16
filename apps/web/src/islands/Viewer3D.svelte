<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { app_state } from "../lib/state";

  type RenderNode = {
    id: string;
    source_object_id?: string;
    transform?: {
      position_m?: { x: number; y: number; z: number };
    };
  };

  type RenderInstruction =
    | { kind: "highlight"; object_ids: string[]; style: { mode: "outline" | "solid" } }
    | { kind: "overlay_labels"; labels: Array<{ object_id: string; text: string }> };

  $: nodes = (($app_state.render_model as any)?.nodes as RenderNode[]) ?? [];
  $: instructions = ($app_state.render_instructions as RenderInstruction[]) ?? [];
  $: highlight_ids = new Set(
    instructions.flatMap((instr) => (instr.kind === "highlight" ? instr.object_ids : []))
  );
  $: overlay_labels = instructions.flatMap((instr) =>
    instr.kind === "overlay_labels" ? instr.labels : []
  );
</script>

<div class="viewer">
  <Canvas clearColor="#f3f4f6">
    <ambientLight intensity={0.6} />
    <directionalLight position={[3, 4, 2]} intensity={0.8} />

    {#each nodes as node}
      <mesh position={[node.transform?.position_m?.x ?? 0, 0, node.transform?.position_m?.z ?? 0]}>
        <boxGeometry args={[0.6, 0.7, 0.6]} />
        <meshStandardMaterial color="#c9b8a7" />
      </mesh>
      {#if node.source_object_id && highlight_ids.has(node.source_object_id)}
        <mesh position={[node.transform?.position_m?.x ?? 0, 0, node.transform?.position_m?.z ?? 0]}>
          <boxGeometry args={[0.66, 0.76, 0.66]} />
          <meshStandardMaterial color="#f59e0b" wireframe />
        </mesh>
      {/if}
    {/each}
  </Canvas>
  {#if overlay_labels.length > 0}
    <div class="labels">
      {#each overlay_labels as label}
        <div class="label">{label.text}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .viewer {
    height: 420px;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    position: relative;
  }
  .labels {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    display: grid;
    gap: 0.35rem;
    z-index: 2;
  }
  .label {
    background: rgba(15, 23, 42, 0.85);
    color: #fff;
    font-size: 0.75rem;
    padding: 0.2rem 0.45rem;
    border-radius: 0.4rem;
  }
</style>

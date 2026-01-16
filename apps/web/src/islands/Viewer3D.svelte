<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { app_state } from "../lib/state";

  type RenderNode = {
    id: string;
    transform?: {
      position_m?: { x: number; y: number; z: number };
    };
  };

  $: nodes = (($app_state.render_model as any)?.nodes as RenderNode[]) ?? [];
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
    {/each}
  </Canvas>
</div>

<style>
  .viewer {
    height: 420px;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
  }
</style>

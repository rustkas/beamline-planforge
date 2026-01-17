<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { onMount } from "svelte";
  import { app_state } from "../lib/state";
  import { resolve_asset_url } from "../lib/assets";
  import { load_material_catalog, pick_primary_material_id, resolve_material } from "../lib/three/materials";
  import GltfNode from "./GltfNode.svelte";

  type RenderNode = {
    id: string;
    source_object_id?: string;
    gltf_key?: string;
    material_overrides?: Record<string, string>;
    lod?: number;
    transform?: {
      position_m?: { x: number; y: number; z: number };
    };
  };

  type RenderAssets = Record<string, { asset_id: string; uri: string }>;

  type RenderInstruction =
    | { kind: "highlight"; object_ids: string[]; style: { mode: "outline" | "solid" } }
    | { kind: "overlay_labels"; labels: Array<{ object_id: string; text: string }> };

  $: nodes = (($app_state.render_model as any)?.nodes as RenderNode[]) ?? [];
  $: assets = (($app_state.render_model as any)?.assets?.gltf as RenderAssets) ?? {};
  $: instructions = ($app_state.render_instructions as RenderInstruction[]) ?? [];
  $: highlight_ids = new Set(
    instructions.flatMap((instr) => (instr.kind === "highlight" ? instr.object_ids : []))
  );
  $: overlay_labels = instructions.flatMap((instr) =>
    instr.kind === "overlay_labels" ? instr.labels : []
  );

  function material_for_node(node: RenderNode): { color: string; roughness?: number; metalness?: number } {
    const id = pick_primary_material_id(node.material_overrides);
    return resolve_material(id);
  }

  onMount(() => {
    const url = resolve_asset_url("assets/materials/materials.json");
    if (url) {
      void load_material_catalog(url);
    }
  });
</script>

<div class="viewer">
  <Canvas clearColor="#f3f4f6">
    <ambientLight intensity={0.6} />
    <directionalLight position={[3, 4, 2]} intensity={0.8} />

    {#each nodes as node}
      {@const material = material_for_node(node)}
      {@const asset = node.gltf_key ? assets[node.gltf_key] : undefined}
      {@const asset_uri = asset?.uri ? resolve_asset_url(asset.uri) : ""}
      <GltfNode
        uri={asset_uri}
        position={[node.transform?.position_m?.x ?? 0, 0, node.transform?.position_m?.z ?? 0]}
        material_id={material.id}
      />
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

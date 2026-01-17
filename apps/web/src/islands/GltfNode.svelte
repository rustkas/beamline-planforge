<script lang="ts">
  import { onMount } from "svelte";
  import { Color, MeshStandardMaterial, type Group, type Mesh } from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { resolve_material } from "../lib/three/materials";

  export let uri = "";
  export let position: [number, number, number] = [0, 0, 0];
  export let material_id: string | undefined = undefined;

  let scene: Group | null = null;
  let load_error = "";
  let current_uri = "";

  function apply_material(root: Group): void {
    const material_def = resolve_material(material_id);
    const color = new Color(material_def.color);
    const material = new MeshStandardMaterial({
      color,
      roughness: material_def.roughness ?? 0.75,
      metalness: material_def.metalness ?? 0.0
    });

    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.material = material;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
  }

  async function load_model(next_uri: string): Promise<void> {
    if (!next_uri) return;
    if (current_uri === next_uri) return;
    current_uri = next_uri;
    load_error = "";

    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(next_uri);
      scene = gltf.scene;
      apply_material(scene);
    } catch (err) {
      load_error = err instanceof Error ? err.message : "failed to load glTF";
      scene = null;
    }
  }

  onMount(() => {
    void load_model(uri);
  });

  $: if (uri && uri !== current_uri) {
    void load_model(uri);
  }
</script>

{#if scene}
  <group position={position}>
    <primitive object={scene} />
  </group>
{:else}
  <mesh position={position}>
    <boxGeometry args={[0.6, 0.7, 0.6]} />
    <meshStandardMaterial color={load_error ? "#ef4444" : "#94a3b8"} />
  </mesh>
{/if}

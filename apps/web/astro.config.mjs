import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import svelte from "@astrojs/svelte";

export default defineConfig({
  output: "server",
  integrations: [svelte()],
  adapter: node({ mode: "standalone" }),
  vite: {
    build: {
      rollupOptions: {
        external: ["/wasm/planforge_core_wasm.js"]
      }
    },
    worker: {
      format: "es",
      rollupOptions: {
        external: ["/wasm/planforge_core_wasm.js"]
      }
    }
  }
});

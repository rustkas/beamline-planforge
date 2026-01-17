import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import svelte from "@astrojs/svelte";

export default defineConfig({
  output: "server",
  integrations: [svelte()],
  adapter: node({ mode: "standalone" }),
  vite: {
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        external: ["/wasm/planforge_core_wasm.js"],
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("three")) return "three";
              if (id.includes("@threlte")) return "threlte";
            }
            return undefined;
          }
        }
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

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2500,
  },
  base: "/the-quiet-below"
});

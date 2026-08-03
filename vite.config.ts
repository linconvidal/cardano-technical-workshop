import { defineConfig } from "vite"

export default defineConfig({
  root: "apps/web",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: ["pop-os", "localhost", "127.0.0.1"],
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
})

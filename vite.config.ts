import { execFileSync } from "node:child_process"

import { defineConfig } from "vite"

const resolveSourceRevision = (): string => {
  try {
    const changes = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
    }).trim()
    if (changes) return ""
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase()
  } catch {
    return ""
  }
}

const sourceRevision = resolveSourceRevision()

export default defineConfig(({ mode }) => ({
  root: "apps/web",
  base: "./",
  define: {
    __WORKBENCH_SOURCE_REVISION__: JSON.stringify(sourceRevision),
    __WORKBENCH_EXECUTION_MODE__: JSON.stringify(mode === "static" ? "static" : "api"),
  },
  build: {
    outDir: mode === "static" ? "../../dist-static" : "../../dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: ["pop-os", "localhost", "127.0.0.1"],
    strictPort: true,
    proxy: mode === "static" ? undefined : { "/api": `http://127.0.0.1:${process.env.PORT ?? 8787}` },
  },
}))

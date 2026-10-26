import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL(mode === "legacy" ? "./releases/1.0.0" : "./arcade", import.meta.url)),
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: fileURLToPath(new URL(mode === "legacy" ? "./arcade-dist/1.0.0" : "./arcade-dist/1.1.0", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5181,
    proxy: { "/api/coindle": "http://127.0.0.1:8787" },
  },
}));

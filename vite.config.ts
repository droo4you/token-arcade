import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { applyShareDocument, cardForPath } from "./apps/api/src/shareMeta.ts";

function shareMetaPlugin(): Plugin {
  return {
    name: "token-arcade-share-meta",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.server) return html;
        const pathname = (ctx.originalUrl ?? "/").split("?")[0] || "/";
        const card = cardForPath(pathname, null);
        if (!card) return html;
        const address = ctx.server.httpServer?.address();
        const port = address && typeof address === "object" ? address.port : ctx.server.config.server.port ?? 5173;
        const configured = ctx.server.config.server.host;
        const host = !configured || configured === true || configured === "0.0.0.0" ? "127.0.0.1" : configured;
        return applyShareDocument(html, card, `http://${host}:${port}`);
      },
    },
  };
}

export default defineConfig({
  root: "apps/web",
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: "public",
  plugins: [shareMetaPlugin()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});

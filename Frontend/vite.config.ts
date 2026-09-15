import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Two build shapes, because they serve different purposes:
//
//   npm run build          -> dist/client + dist/server/server.js
//                            A fetch handler, which `vite preview` wraps in its
//                            own HTTP server. Good for local verification.
//
//   npm run build:server   -> .output/server/index.mjs + .output/public
//                            A self-listening Node server (honours PORT/HOST),
//                            which is what systemd runs in production. Enabled
//                            by BUILD_NODE_SERVER=1.
//
// Deploying to a different platform means swapping the nitro preset below (for
// example "cloudflare-module"); that changes the output layout too.
const buildNodeServer = process.env.BUILD_NODE_SERVER === "1";

export default defineConfig(({ mode }) => {
  // Inline VITE_* vars so they resolve in the SSR bundle as well as the
  // client build.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      // Duplicate copies of React or the query client break hooks and cache
      // identity across the SSR/client boundary.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Route Start's bundled server entry through src/server.ts (our SSR
        // error wrapper).
        server: { entry: "server" },
        // Fail the build if server-only code is pulled into the client bundle.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      ...(buildNodeServer ? [nitro({ preset: "node-server" })] : []),
      viteReact(),
    ],
  };
});

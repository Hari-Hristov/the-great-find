import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

// electron-vite splits the project into three build outputs (main / preload /
// renderer). The renderer reuses the existing Vite configuration — same
// plugins, same alias — so the dashboard works identically in browser-only
// dev (`npm run dev`) and Electron dev (`npm run dev:electron`).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      lib: {
        entry: "electron/main.ts",
      },
      rollupOptions: {
        output: {
          format: "es",
          entryFileNames: "index.js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      lib: {
        entry: "electron/preload.ts",
      },
      rollupOptions: {
        output: {
          format: "cjs",
          // MUST be .cjs — package.json has "type": "module" so a plain .js
          // extension is interpreted as ESM, and Electron's preload loader
          // uses synchronous require() which only accepts CommonJS.
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [
      TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "out/renderer",
      target: "es2022",
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      // electron-vite expects the entry HTML at src/renderer/index.html by
      // default. This repo keeps it at the Vite-standard frontend/index.html
      // (browser-only dev shares the same file), so we point rollup at it
      // explicitly.
      rollupOptions: {
        input: path.resolve(__dirname, "./index.html"),
      },
    },
    server: {
      port: 5173,
      // Same proxy as the browser-only dev config. Even in Electron dev the
      // renderer boots via the Vite dev server (electron-vite hands it the
      // URL via ELECTRON_RENDERER_URL); if the preload bridge fails to
      // resolve the backend port, this proxy is the fallback that keeps
      // /api and /events reachable.
      proxy: {
        "/api": { target: "http://127.0.0.1:8088", changeOrigin: true },
        "/events": { target: "http://127.0.0.1:8088", changeOrigin: true, ws: false },
      },
    },
    optimizeDeps: {
      include: [
        "@react-three/fiber",
        "@react-three/drei",
        "@react-three/postprocessing",
        "three",
      ],
    },
  },
});

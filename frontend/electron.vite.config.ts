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
          entryFileNames: "index.js",
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
    },
    server: {
      port: 5173,
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

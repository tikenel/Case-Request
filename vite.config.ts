import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: { input: { main: resolve("index.html"), launch: resolve("launch.html"), docs: resolve("docs.html") } },
  },
  server: { proxy: { "/api": "http://localhost:8787" } },
  test: { include: ["tests/**/*.test.ts"], env: { NODE_ENV: "test" } },
} as never);

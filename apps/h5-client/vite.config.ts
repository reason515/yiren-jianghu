import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** H5 客户端（浏览器 SPA）：生产 VITE_API_BASE=/api（nginx 去前缀代理到 API）。 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", rewrite: (p) => p.replace(/^\/api/, "") },
      "/ws": { target: "http://127.0.0.1:3000", ws: true },
    },
  },
});

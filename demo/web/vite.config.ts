import { defineConfig } from "vite";

const apiTarget = process.env.DEMO_API_TARGET ?? "http://127.0.0.1:3031";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});

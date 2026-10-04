import { defineConfig } from "vite";

// `bun run dev` serves the app with hot reload on 5174 (5173 is often taken by Forth's site); /api goes to the Bun server on 8787.
export default defineConfig({
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});

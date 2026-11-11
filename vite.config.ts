import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Ports are allocated centrally in C:\Claude\PORTS.md - do not change them without updating it.
export default defineConfig({
  plugins: [react()],
  server: {
    // Pin to IPv4 so both http://127.0.0.1:5189 and http://localhost:5189 open.
    host: "127.0.0.1",
    port: 5189,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4319",
    },
  },
});

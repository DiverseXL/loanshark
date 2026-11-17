import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Client-side only: no SSR, no server-side rendering plugin, no proxy. The page
// talks to the two QoreChain hosts named in the content security policy.
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// Client-side only: no SSR, no server-side rendering plugin, no proxy. The page
// talks to the two QoreChain hosts named in the content security policy.
//
// The CSP in index.html is the production policy. Vite's development server
// injects the React refresh preamble as an inline script and its CSS through
// inline style tags, both of which the production policy blocks. This plugin
// applies only to `vite` (serve), never to `vite build`, and relaxes exactly
// those two directives for the development server. The production build keeps
// `script-src 'self'` and `style-src 'self'`; the checklist uses `preview` to
// verify the built page.
const devInlineCompat = (): Plugin => ({
  name: "loanshark-dev-inline-compat",
  apply: "serve",
  transformIndexHtml: {
    order: "pre",
    handler(html: string): string {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
    },
  },
});

export default defineConfig({
  plugins: [devInlineCompat(), react()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

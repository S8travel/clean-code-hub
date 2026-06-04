import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// ID build duy nhất mỗi lần build (timestamp). Inject vào bundle (__APP_VERSION__)
// + ghi ra /version.json để client poll → phát hiện deploy mới và tự tải lại.
const BUILD_ID = Date.now().toString();

// Emit dist/version.json (filesystem-served, Vercel rewrite không đụng tới file thật).
function emitVersionJson(): Plugin {
  return {
    name: "emit-version-json",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: BUILD_ID }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_ID),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), emitVersionJson()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks — tách heavy libs để có thể cache độc lập + lazy load
          "vendor-react":     ["react", "react-dom", "react-router-dom"],
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-toast",
          ],
          "vendor-query":     ["@tanstack/react-query", "@tanstack/react-query-devtools"],
          "vendor-supabase":  ["@supabase/supabase-js"],
          "vendor-motion":    ["framer-motion"],
          "vendor-recharts":  ["recharts"],
          "vendor-xlsx":      ["xlsx"],
          "vendor-docx":      ["docx", "file-saver"],
          "vendor-dnd":       ["@dnd-kit/core"],
          "vendor-form":      ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-date":      ["date-fns", "react-day-picker"],
        },
      },
    },
  },
}));

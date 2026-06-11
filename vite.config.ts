import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
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
  plugins: [
    react(),
    emitVersionJson(),
    // PWA: cài lên màn hình chính + chạy standalone. Network-first, KHÔNG offline —
    // giữ version.json làm cơ chế báo bản mới (xem src/lib/version-check.ts).
    VitePWA({
      // "prompt" + skipWaiting=false: SW mới CHỜ, KHÔNG tự reload đột ngột (app
      // autosave onBlur — reload giữa chừng có thể mất input). version.json vẫn là
      // cơ chế báo bản mới DUY NHẤT; reload đó sẽ kích hoạt SW mới + asset mới.
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "favicon-32x32.png", "logo.jpg"],
      manifest: {
        name: "S8 Travel Nội Bộ",
        short_name: "S8 Travel",
        description: "Quản lý điều hành tour nội bộ S8 Travel",
        lang: "vi",
        theme_color: "#0f5180",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache CHỈ asset tĩnh content-hashed (JS/CSS/icon/font) → load nhanh, an
        // toàn (đổi nội dung = đổi tên file). KHÔNG precache index.html.
        globPatterns: ["**/*.{js,css,png,svg,woff,woff2}"],
        globIgnores: ["**/version.json", "sw-notify.js"],
        // Handler notificationclick cho notification bắn qua reg.showNotification()
        // (Android PWA). Xem public/sw-notify.js.
        importScripts: ["sw-notify.js"],
        // Bỏ qua chunk khổng lồ (tesseract/xlsx/docx…) — app không cần offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // index.html LUÔN ra network (luôn mới khi online); offline thì không mở —
        // đúng yêu cầu "không offline".
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        // clientsClaim: SW kiểm soát trang ngay lần cài đầu (để cài + phục vụ cache).
        // KHÔNG skipWaiting → bản SW mới chờ tới reload kế (do version.json kích hoạt).
        clientsClaim: true,
      },
      // Không bật SW trong dev để khỏi nhiễu HMR.
      devOptions: { enabled: false },
    }),
  ],
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

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 1:1 with the demo's injected manifest (see demo/app.js PWA block).
export default defineConfig({
  base: "./",
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Kurukshetra · कुरुक्षेत्र",
        short_name: "Kurukshetra",
        description: "A tour companion for the 48 Kos Kurukshetra tirtha land.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F5F2EC",
        theme_color: "#1E2A33",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});

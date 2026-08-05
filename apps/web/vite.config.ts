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
      // Without this the plugin switches itself off under `npm run dev`: no
      // <link rel="manifest">, no service worker, so Chrome cannot treat the
      // page as installable and never fires `beforeinstallprompt`. "Download
      // now" then falls through to the manual how-to sheet on every tap, which
      // reads exactly like a broken install button — and it is only ever
      // testable by building. Dev now behaves like production on this point.
      devOptions: { enabled: true, type: "module" },
      // Was ["favicon.ico"] — a file that has never existed in this repo, so
      // the precache manifest carried an entry the service worker could not
      // fetch. The icons are real files and are what iOS reads.
      includeAssets: ["icons/apple-touch-icon.png"],
      // Push lives in public/push-sw.js and is imported into the generated
      // worker. Two event handlers do not justify moving the whole build to
      // injectManifest and owning the precache logic by hand.
      workbox: {
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            /*
             * Photographs, now that they come from R2 rather than the bundle.
             *
             * They were never precached even when they were bundled — the
             * default glob is js/css/html/ico/png/svg and every photograph here
             * is .webp — so on a dead signal the app has always drawn empty
             * frames for anything not still in the browser's HTTP cache. This
             * is the first time an image survives being seen once.
             *
             * CacheFirst, not StaleWhileRevalidate: these are photographs of
             * temples, keyed by a stable id. They change when someone in an
             * office replaces one, which is rare, and the Worker already serves
             * them with a day's max-age and an ETag. Revalidating every view
             * would spend a request on a rural connection to be told nothing
             * has changed — which is the exact cost this app is built to avoid.
             */
            urlPattern: ({ url }) => /\/img\/[^/]+$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              // -v2 because the first version poisoned itself, and a renamed
              // cache is the only way to abandon what it already holds.
              cacheName: "kuk-photos-v2",
              // ~140 photographs at 20-50 KB. The cap is a safety rail against
              // a bucket that grows, not a budget anyone is expected to hit.
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              /*
               * 200 ONLY. This said `[0, 200]`, and status 0 is an opaque
               * response — what a cross-origin request returns when it could
               * not be read, including one that failed. Under CacheFirst that
               * is a permanent broken image: the failure is written to the
               * cache and served for sixty days without ever asking again.
               *
               * Anything fetched while the /img/ route was returning 404s was
               * cached exactly this way, which is why photographs stayed broken
               * on a device long after the server was fixed. The Worker sets
               * access-control-allow-origin, so a real success is a readable
               * 200 and there is nothing an opaque response could add.
               */
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
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
        // These three files did not exist. public/icons/ was an empty directory,
        // so every entry here 404'd — and a 192px AND a 512px icon that actually
        // load are a hard requirement for installability. Chrome therefore never
        // fired `beforeinstallprompt`, so "Download now" could only ever fall
        // through to the manual how-to sheet. The card was never broken; it had
        // nothing to prompt with.
        //
        // The maskable one is a separate file on purpose. It cannot be the
        // full-bleed icon: a launcher crops a maskable icon to its own shape,
        // and this seal reaches its own edges, so a circular mask would cut the
        // gold rim and the "SAARTHI" wordmark off the bottom. The maskable copy
        // sits at 75% on white, which is the padding the crop is meant to eat.
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});

// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa';

const manifestForPlugin: Partial<VitePWAOptions> = {
  registerType: "prompt",
  includeAssets: ['favicon.ico', "apple-touc-icon.png", "masked-icon.png"],
  workbox: {
    // กำหนดขนาดสูงสุดสำหรับไฟล์ที่ precached ให้สูงถึง 5 MiB
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },
  manifest: {
    name: "Egg Digital",
    short_name: "Egg Digital",
    description: "An app that can show the Egg Digital Image Tracking.",
    icons: [
      {
        src: "icons/icons-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "icons/icons-256.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "favicon"
      },
      {
        src: "icons/icons-180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "apple touch icon"
      },
      {
        src: "icons/icons-144.png",
        sizes: "144x144",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "icons/icons-256.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "icon"
      },
    ],
    theme_color: "#181818",
    background_color: "#e8eac2",
    display: "standalone",
    scope: "/",
    start_url: "/",
    orientation: "any",
  },
};

export default defineConfig({
  plugins: [react(), VitePWA(manifestForPlugin)],
});

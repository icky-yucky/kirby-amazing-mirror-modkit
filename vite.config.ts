import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds src/KirbySpriteStudio.html into ONE self-contained file (dist/KirbySpriteStudio.html)
// so it can be double-clicked, shared, or hosted anywhere with no server.
export default defineConfig({
  root: "src",
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: resolve(__dirname, "src/KirbySpriteStudio.html") },
  },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
});

import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import electron from "vite-plugin-electron/simple"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
    electron({
      main: {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            minify: false,
          },
        },
      },
      preload: {
        input: "src/preload/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/preload",
            minify: false,
            rollupOptions: {
              output: {
                format: "es",
              },
            },
          },
        },
      },
    }),
  ],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer"),
    },
  },
})

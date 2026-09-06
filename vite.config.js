import { defineConfig } from "vite";

// index.html reste directement exploitable sans build. En production, Vite
// remplace uniquement son point d’entrée par le mince adaptateur TypeScript.
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [{
    name: "kulturo-typescript-entry",
    transformIndexHtml(html) {
      return html.replace(
        '<script type="module" src="app.js"></script>',
        '<script type="module" src="/src/main.ts"></script>',
      );
    },
  }],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      external: id => /^https?:\/\//.test(id),
      output: {
        entryFileNames: "assets/kulturo-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

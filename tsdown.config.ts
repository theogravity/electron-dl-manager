import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  splitting: false,
  sourcemap: false,
  clean: true,
  target: "es2022",
  minify: false,
  dts: true,
});

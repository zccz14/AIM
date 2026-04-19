import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["./src/index.ts"],
  fixedExtension: false,
  format: ["esm"],
  outDir: "./dist",
  outExtensions: () => ({
    dts: ".d.ts",
    js: ".js",
  }),
  platform: "node",
  sourcemap: true,
  target: "node24",
  treeshake: true,
});

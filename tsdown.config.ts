import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
  sourcemap: true,
  treeshake: true,
  outDir: "dist",
  // 供叶子可发布包复用；各包自行声明 entry，Web 应用继续使用 Vite 原生构建链。
});

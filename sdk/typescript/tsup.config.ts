import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  // 同时出 ESM 与 CJS：SDK 会被 Node 脚本、打包器和浏览器三种场景引用。
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2020",
})

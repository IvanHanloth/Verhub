#!/usr/bin/env node
// 从 ESM 源 verhub-sdk.js 生成浏览器可直接用 <script> 引的 verhub-sdk.global.js。
//
// 只做一件事：把文件末尾唯一那条 `export { ... }` 换成挂到 window 的 UMD 包装。
// 因此源文件里除结尾外不得再出现 export，导出清单也集中在那一处，改一处即可。

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(dir, "verhub-sdk.js"), "utf8")

const match = source.match(/export\s*\{([\s\S]*?)\}\s*$/)
if (!match) {
  console.error("没找到结尾的 export 块，无法生成 global 版本")
  process.exit(1)
}

const names = match[1]
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)

const body = source.slice(0, match.index).trimEnd()
const assignments = names.map((name) => `    root.${name} = ${name}`).join("\n")

const output = `// 本文件由 sdk/vanilla-js/build.mjs 从 verhub-sdk.js 生成，请勿手改。
;(function (root, factory) {
  factory(root)
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
${body}

${assignments}
})
`

writeFileSync(path.join(dir, "verhub-sdk.global.js"), output, "utf8")
console.log(`已生成 verhub-sdk.global.js（导出 ${names.length} 个符号）`)

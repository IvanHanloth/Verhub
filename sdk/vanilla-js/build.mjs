#!/usr/bin/env node
// 从 ESM 源 verhub-sdk.js 生成浏览器可直接用 <script> 引的 verhub-sdk.global.js。
//
// 把文件末尾唯一那条 `export { ... }` 换成挂到 window 的 UMD 包装，因此源文件里
// 除结尾外不得再出现 export。
//
// 直接执行本文件即写盘；测试 import { render, SOURCE_PATH, OUTPUT_PATH } 来校验
// 生成物与源是否同步。

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

/** ESM 源文件路径。 */
export const SOURCE_PATH = path.join(dir, "verhub-sdk.js")

/** 生成物路径。 */
export const OUTPUT_PATH = path.join(dir, "verhub-sdk.global.js")

/**
 * 把 ESM 源渲染成 UMD 形式的全局版本。
 *
 * @param {string} source verhub-sdk.js 的内容
 * @returns {{ output: string, names: string[] }} 生成的文件内容与导出符号名
 * @throws {Error} 源文件末尾没有 export 块
 */
export function render(source) {
  const match = source.match(/export\s*\{([\s\S]*?)\}\s*$/)
  if (!match) {
    throw new Error("没找到结尾的 export 块，无法生成 global 版本")
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

  return { output, names }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  try {
    const { output, names } = render(readFileSync(SOURCE_PATH, "utf8"))
    writeFileSync(OUTPUT_PATH, output, "utf8")
    console.log(`已生成 verhub-sdk.global.js（导出 ${names.length} 个符号）`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

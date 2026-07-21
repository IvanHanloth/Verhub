#!/usr/bin/env node
// 把仓库根目录的 verhub.openapi.yaml 转成前端可直接 import 的 TS 常量。
//
// 前端不引入 YAML 解析器：/doc 与管理端弹窗都在构建期消费这份生成物，
// 运行时只做纯对象遍历。yaml 是唯一数据源，改完 yaml 跑 `pnpm api:sync`。
//
// 输出先过一遍 prettier，与仓库格式规范保持一致 —— 否则 lint-staged 的
// prettier 会在提交时重排这个文件，与生成器输出反复打架。

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { format, resolveConfig } from "prettier"
import { parse } from "yaml"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = resolve(repoRoot, "verhub.openapi.yaml")
const outputPath = resolve(repoRoot, "web/lib/api-docs/openapi.generated.ts")

const banner = `// 本文件由 scripts/generate-api-docs.mjs 自动生成，请勿手工编辑。
// 数据源：verhub.openapi.yaml —— 修改接口契约后执行 \`pnpm api:sync\` 重新生成。

import type { OpenApiDocument } from "./openapi-types"

export const openApiDocument: OpenApiDocument = `

async function main() {
  const document = parse(readFileSync(sourcePath, "utf8"))

  if (!document?.paths) {
    throw new Error(`解析 ${sourcePath} 失败：缺少 paths 节点`)
  }

  const prettierConfig = await resolveConfig(outputPath)
  const body = await format(`${banner}${JSON.stringify(document, null, 2)}\n`, {
    ...prettierConfig,
    filepath: outputPath,
  })

  writeFileSync(outputPath, body, "utf8")
  process.stdout.write(`生成完成：${outputPath}（${Object.keys(document.paths).length} 条路径）\n`)
}

await main()

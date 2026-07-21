#!/usr/bin/env node
// Verhub 版本号工具
//
// 版本号的唯一真源是根 package.json 的 version，其余可发布包必须与之一致：
//   package.json / packages/backend / packages/ui / web / sdk/typescript / doc
// 内部配置包（eslint-config、typescript-config）不参与，它们不进入运行时。
// verhub.openapi.yaml 的 info.version 是 API 契约版本，也不参与。
//
// 发版流程（.github/workflows/release.yml）先 apply 写入并提交，
// 再 check 校验，防止 tag 与代码里的版本号对不上。
//
// 用法：
//   node scripts/version.mjs apply v1.2.3   # 写入所有文件
//   node scripts/version.mjs check v1.2.3   # 校验各处与该 tag 一致，不一致则失败
//   node scripts/version.mjs check          # 不给 tag 时以根 package.json 为基准
//   node scripts/version.mjs show           # 打印当前版本号
//
// 在 GitHub Actions 中运行时，会把 version / tag / is_prerelease
// 追加写入 $GITHUB_OUTPUT，供后续步骤使用。

import { readFileSync, writeFileSync, appendFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// 第一项是真源，其余跟随
const TARGETS = [
  "package.json",
  "packages/backend/package.json",
  "packages/ui/package.json",
  "web/package.json",
  "sdk/typescript/package.json",
  "doc/package.json",
]

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function fail(message) {
  if (process.env.GITHUB_ACTIONS) {
    console.error(`::error::${message}`)
  }
  console.error(message)
  process.exit(1)
}

// 归一化：去掉前导 v，校验为标准 semver
function normalize(raw) {
  if (!raw) {
    fail("缺少版本号参数（例如 v1.2.3 或 1.3.0-rc.1）")
  }

  const v = raw.trim().replace(/^v/i, "")
  if (!SEMVER.test(v)) {
    fail(`版本号格式非法：${raw}（应形如 1.2.3 或 1.3.0-rc.1）`)
  }

  return v
}

function readJson(relPath) {
  return readFileSync(path.join(root, relPath), "utf8")
}

function getVersion(relPath) {
  const parsed = JSON.parse(readJson(relPath))
  if (typeof parsed.version !== "string") {
    fail(`${relPath} 里没有 version 字段`)
  }
  return parsed.version
}

// 只改顶层第一处 "version": "..."，避免动到依赖项里的版本约束；
// 用文本替换而非 JSON.stringify，保留原有格式与尾随换行
function setVersion(relPath, version) {
  const content = readJson(relPath)
  let replaced = false
  const updated = content.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, (_m, before, after) => {
    replaced = true
    return `${before}${version}${after}`
  })

  if (!replaced) {
    fail(`${relPath} 里找不到可替换的 version 字段`)
  }

  writeFileSync(path.join(root, relPath), updated, "utf8")
}

function exportOutputs(version) {
  const isPrerelease = version.includes("-") ? "true" : "false"
  console.log(`版本号：${version}（tag v${version}，预发布 ${isPrerelease}）`)

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version}\ntag=v${version}\nis_prerelease=${isPrerelease}\n`,
    )
  }
}

const [action, tag] = process.argv.slice(2)

switch (action) {
  case "show": {
    exportOutputs(getVersion(TARGETS[0]))
    break
  }

  case "apply": {
    const version = normalize(tag)
    for (const target of TARGETS) {
      setVersion(target, version)
    }
    console.log(`已写入：\n  ${TARGETS.join("\n  ")}`)
    exportOutputs(version)
    break
  }

  case "check": {
    // 不给 tag 时，以根 package.json 为基准校验其余文件是否跟得上
    const version = tag ? normalize(tag) : normalize(getVersion(TARGETS[0]))
    const bad = TARGETS.filter((target) => getVersion(target) !== version)

    if (bad.length > 0) {
      for (const target of bad) {
        console.error(`::error::${target} 的版本号是 ${getVersion(target)}，与目标 ${version} 不符`)
      }
      fail(`版本号校验失败：请先运行 node scripts/version.mjs apply ${version} 并提交`)
    }

    console.log(`版本号校验通过：${TARGETS.length} 处文件均为 ${version}`)
    exportOutputs(version)
    break
  }

  default:
    fail("用法：node scripts/version.mjs <apply|check|show> [version]")
}

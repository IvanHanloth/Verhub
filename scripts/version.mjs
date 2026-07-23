#!/usr/bin/env node
// Verhub 版本号工具
//
// 版本号的唯一真源是根 package.json 的 version，其余可发布物必须与之一致：
//   - JSON 包：package.json / packages/backend / packages/ui / web /
//     sdk/typescript / sdk/vanilla-js / doc
//   - 版本常量文件：Python / Rust / TS / 纯 JS 各 SDK 内部各写一处 X.Y.Z 字符串
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
const JSON_TARGETS = [
  "package.json",
  "packages/backend/package.json",
  "packages/ui/package.json",
  "web/package.json",
  "sdk/typescript/package.json",
  "sdk/vanilla-js/package.json",
  "doc/package.json",
]

// 非 JSON 的版本常量：每个 SDK 在源码里各写死一处 X.Y.Z，靠正则的捕获组定位。
// 捕获组 1 是版本号前缀，捕获组 2 是后缀，中间即被替换的版本串。
const REGEX_TARGETS = [
  {
    path: "sdk/python/verhub_sdk/_version.py",
    pattern: /(VERHUB_SDK_VERSION = ")\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(")/,
  },
  {
    path: "sdk/typescript/src/version.ts",
    pattern: /(VERHUB_SDK_VERSION = ")\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(")/,
  },
  {
    path: "sdk/vanilla-js/verhub-sdk.js",
    pattern: /(const VERHUB_SDK_VERSION = ")\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(")/,
  },
  {
    path: "sdk/rust/src/lib.rs",
    pattern: /(pub const VERHUB_SDK_VERSION: &str = ")\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(")/,
  },
  {
    // Cargo.toml 顶部 [package] 段的 version；限定行首以免动到依赖项的版本约束。
    path: "sdk/rust/Cargo.toml",
    pattern: /(^version = ")\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(")/m,
  },
]

const ALL_TARGETS = [...JSON_TARGETS, ...REGEX_TARGETS.map((t) => t.path)]

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

function readFile(relPath) {
  return readFileSync(path.join(root, relPath), "utf8")
}

const regexTargetOf = (relPath) => REGEX_TARGETS.find((t) => t.path === relPath)

function getVersion(relPath) {
  const target = regexTargetOf(relPath)
  if (target) {
    const match = readFile(relPath).match(target.pattern)
    if (!match) {
      fail(`${relPath} 里找不到版本号`)
    }
    // 去掉捕获组包裹，留中间的版本串
    return match[0].slice(match[1].length, match[0].length - match[2].length)
  }

  const parsed = JSON.parse(readFile(relPath))
  if (typeof parsed.version !== "string") {
    fail(`${relPath} 里没有 version 字段`)
  }
  return parsed.version
}

// 用文本替换而非结构化写回，保留原有格式与尾随换行。
function setVersion(relPath, version) {
  const content = readFile(relPath)
  const target = regexTargetOf(relPath)

  let replaced = false
  const updated = target
    ? content.replace(target.pattern, (_m, before, after) => {
        replaced = true
        return `${before}${version}${after}`
      })
    : // JSON 只改顶层第一处 "version"，避免动到依赖项里的版本约束
      content.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, (_m, before, after) => {
        replaced = true
        return `${before}${version}${after}`
      })

  if (!replaced) {
    fail(`${relPath} 里找不到可替换的版本号`)
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
    exportOutputs(getVersion(ALL_TARGETS[0]))
    break
  }

  case "apply": {
    const version = normalize(tag)
    for (const target of ALL_TARGETS) {
      setVersion(target, version)
    }
    console.log(`已写入：\n  ${ALL_TARGETS.join("\n  ")}`)
    exportOutputs(version)
    break
  }

  case "check": {
    // 不给 tag 时，以根 package.json 为基准校验其余文件是否跟得上
    const version = tag ? normalize(tag) : normalize(getVersion(ALL_TARGETS[0]))
    const bad = ALL_TARGETS.filter((target) => getVersion(target) !== version)

    if (bad.length > 0) {
      for (const target of bad) {
        console.error(`::error::${target} 的版本号是 ${getVersion(target)}，与目标 ${version} 不符`)
      }
      fail(`版本号校验失败：请先运行 node scripts/version.mjs apply ${version} 并提交`)
    }

    console.log(`版本号校验通过：${ALL_TARGETS.length} 处文件均为 ${version}`)
    exportOutputs(version)
    break
  }

  default:
    fail("用法：node scripts/version.mjs <apply|check|show> [version]")
}

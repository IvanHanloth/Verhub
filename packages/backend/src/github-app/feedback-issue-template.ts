/**
 * 反馈转发 Issue 的模板：内置缺省值、变量替换、以及仓库模板文件的解析。
 *
 * 内置模板同时是管理端「自定义模板」输入框的初值，所以必须能被前端读到 ——
 * 常量在这里定义一次，经配置视图回传，避免前后端各抄一份后慢慢漂移。
 */

/** 模板可用变量。UI 的变量清单直接渲染这份列表，改动只需动一处。 */
export const FEEDBACK_ISSUE_TEMPLATE_VARIABLES = [
  "project_key",
  "project_name",
  "feedback_id",
  "content",
  "content_head",
  "rating",
  "contact",
  "user_id",
  "platform",
  "platform_version",
  "created_at",
] as const

export const BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE = "[用户反馈] {{content_head}}"

/**
 * 内置正文不含评分：转发到 Issue 的是「需要跟进的问题」，把打分搬进仓库既没有
 * 处理价值，也容易让维护者把满意度当成 Issue 优先级。要展示评分请自定义模板。
 */
export const BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE = [
  "## 反馈内容",
  "",
  "{{content}}",
  "",
  "## 元信息",
  "",
  "| 字段 | 值 |",
  "| --- | --- |",
  "| 项目 | {{project_name}} (`{{project_key}}`) |",
  "| 反馈 ID | `{{feedback_id}}` |",
  "| 联系方式 | {{contact}} |",
  "| 用户 ID | {{user_id}} |",
  "| 平台 | {{platform}} {{platform_version}} |",
  "| 提交时间 | {{created_at}} |",
  "",
  "> 由 Verhub 自动转发。",
].join("\n")

/** 项目级模板来源。inherit 跟随实例，custom 用本项目的字段，repo 读仓库文件。 */
export const FEEDBACK_TEMPLATE_SOURCES = ["inherit", "custom", "repo"] as const

export type FeedbackTemplateSource = (typeof FEEDBACK_TEMPLATE_SOURCES)[number]

/** 一套可直接用于建 Issue 的模板。labels 只有仓库模板会给出。 */
export type FeedbackIssueTemplate = {
  title: string
  body: string
  labels?: string[]
}

// 模板渲染与 AI 翻译的提示词共用一份实现，见 common/template。
export { renderTemplate } from "../common/template"

/**
 * 解析仓库里的模板文件。
 *
 * 约定格式：可选的 `---` front matter 放 title / labels，其余全部是正文。
 * 没有 front matter 时整个文件就是正文，标题退回内置模板 —— 让「仓库里放一个
 * 纯 markdown 文件」这种最省事的用法直接可用。
 */
export function parseRepoTemplateFile(raw: string): FeedbackIssueTemplate {
  // BOM 写成转义：字面量 U+FEFF 在源码里不可见，还会被 no-irregular-whitespace 拦下。
  const normalized = raw.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "")
  const matched = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!matched) {
    return { title: BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE, body: normalized.trim() }
  }

  const frontMatter = parseFrontMatter(matched[1] ?? "")
  const body = normalized.slice(matched[0].length).trim()
  const labels = (frontMatter.labels ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)

  return {
    title: frontMatter.title?.trim() || BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
    body: body || BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
    ...(labels.length > 0 ? { labels } : {}),
  }
}

/**
 * front matter 只认 `key: value` 单行键值，够覆盖 title / labels 两个键。
 * 不引 YAML 解析器：模板文件来自仓库（半可信输入），键集越小越难出意外。
 */
function parseFrontMatter(block: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of block.split("\n")) {
    const separator = line.indexOf(":")
    if (separator <= 0) {
      continue
    }
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    if (key) {
      result[key] = value
    }
  }
  return result
}

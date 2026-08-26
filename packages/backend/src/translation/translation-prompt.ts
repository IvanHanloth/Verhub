/**
 * 翻译提示词：内置系统提示词、变量替换，以及按内容类型拼出的用户消息。
 *
 * 内置提示词同时是管理端「自定义提示词」输入框的初值，所以必须能被前端读到 ——
 * 常量在这里定义一次，经配置视图回传，避免前后端各抄一份后慢慢漂移。
 */

import type { TranslationKind } from "./types"

/** 系统提示词可用的变量。UI 的变量清单直接渲染这份列表，改动只需动一处。 */
export const TRANSLATION_PROMPT_VARIABLES = [
  "target_locale",
  "target_label",
  "source_locale",
] as const

/**
 * 内置系统提示词。
 *
 * 「只输出 JSON」这条是硬要求：服务端按 JSON 解析回包，模型多说一句寒暄就会解析失败。
 * 占位符与代码块要原样保留 —— 公告正文里的 `{{version}}` 被译成别的写法，
 * 客户端渲染出来就是一串没被替换掉的乱码。
 */
export const BUILTIN_TRANSLATION_SYSTEM_PROMPT = [
  "你是软件产品的本地化译者。用户会给你一个 JSON 对象，把其中每个字段的值翻译成 {{target_label}}（语言标签 {{target_locale}}）。",
  "",
  "必须遵守：",
  "- 只输出一个 JSON 对象，键与输入完全一致，值为译文。不要输出解释、说明或代码围栏。",
  "- 原样保留 Markdown 结构、代码块内容、链接地址、HTML 标签，以及 {{ }} 形式的占位符。",
  "- 保留原文的换行与段落划分。",
  "- 版本号、产品名、品牌名保持原样；技术术语按目标语言的通行译法，没有通行译法就保留原文。",
  "- 语气与原文一致，面向终端用户，简洁自然。不要增删原文没有的信息。",
  "- 某个字段的值为空字符串时，译文也返回空字符串。",
].join("\n")

/**
 * 各内容类型的补充说明，拼进用户消息而不是系统提示词。
 *
 * 放在这里而不是提示词模板里：管理员自定义提示词时不必把每种内容的说明重抄一遍，
 * 换个措辞也不会把「正文是 Markdown」这类事实说丢。
 */
const KIND_NOTES: Record<TranslationKind, string> = {
  announcement:
    "这是产品内公告。title 是一行短标题，content 是 Markdown 正文，可能含标题、列表、链接与代码块。",
  project: "这是产品/项目的展示信息。name 是简短名称，只给译名不要加解释；description 是一句简介。",
  version:
    "这是一次版本发布的说明。title 是一行短标题，content 是 Markdown 更新说明，常含列表、代码块与 issue/PR 链接。版本号、提交哈希、依赖包名与 @用户名保持原样。",
}

/**
 * 用户消息：内容类型说明 + 待译字段的 JSON。
 *
 * 字段用 JSON 而不是自然语言罗列，是为了让「回一个同构 JSON」这个要求有个明确对照，
 * 模型照着输入的形状回包比照着说明构造要稳。
 */
export function buildUserMessage(options: {
  kind: TranslationKind
  fields: Record<string, string>
  sourceLocale: string | null
}): string {
  const lines = [KIND_NOTES[options.kind]]

  if (options.sourceLocale) {
    lines.push(`原文语言：${options.sourceLocale}。`)
  }

  lines.push("", "待翻译的 JSON：", JSON.stringify(options.fields, null, 2))
  return lines.join("\n")
}

/** 「测试连接」用的样例。短、含一个占位符，能一眼看出模型是否守规矩。 */
export const TRANSLATION_TEST_SAMPLE = "本次更新修复了若干问题，建议升级到 {{version}}。"

/**
 * 极简 {{variable}} 模板替换。
 *
 * 反馈转发的 Issue 模板与 AI 翻译的提示词都靠它渲染——两处都是让管理员自己写
 * 模板，出问题时能一眼对上号比多一层能力更重要，所以刻意不支持条件与循环。
 */

/** 未知变量原样保留，方便在渲染结果里发现模板笔误。 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) => {
    return name in variables ? (variables[name] ?? match) : match
  })
}

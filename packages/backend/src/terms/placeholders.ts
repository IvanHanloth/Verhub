/**
 * 条款模板的占位符登记表。
 *
 * 内置正文是模板不是终稿：运营主体、地址、联系方式这类只有运营者知道的内容留成
 * {{key}}，管理端据本表渲染填空表单，替换后的成品才写进库 —— 库里存的永远是可以
 * 直接对外展示的正文，前台不做任何替换。
 *
 * 键必须先在这里登记：正文里出现未登记的键会在模块加载时直接抛错，避免上线后
 * 前台漏出一个没人填得上的 {{}}。
 */

export type TermsPlaceholder = {
  key: string
  /** 填空表单的字段名。 */
  label: string
  /** 填写要求，写清楚「填什么」而不是「是什么」。 */
  hint: string
  /** 预填值。够用即可直接保存，不必逐条改写。 */
  example: string
  /** 为 false 的项留空也允许发布。 */
  required: boolean
}

const REGISTRY: TermsPlaceholder[] = [
  {
    key: "effective_date",
    label: "生效日期",
    hint: "本版条款对外生效的日期，通常填发布当天。",
    example: "2026 年 07 月 28 日",
    required: true,
  },
  {
    key: "operator_name",
    label: "运营主体全称",
    hint: "部署并运营本实例的主体，须与营业执照或者备案主体一致。",
    example: "示例科技（北京）有限公司",
    required: true,
  },
  {
    key: "operator_address",
    label: "注册地址",
    hint: "运营主体的注册地址，同时用作条款末尾的通讯地址。",
    example: "北京市海淀区示例路 1 号 A 座 100 室",
    required: true,
  },
  {
    key: "contact_email",
    label: "个人信息保护联系邮箱",
    hint: "受理查阅、删除、投诉等请求的邮箱，须长期有效。",
    example: "privacy@example.com",
    required: true,
  },
  {
    key: "dpo_contact",
    label: "个人信息保护负责人",
    hint: "姓名或者部门名称与联系方式；未设立的填「暂未设立，请通过上述邮箱联系」。",
    example: "暂未设立，请通过上述邮箱联系",
    required: false,
  },
  {
    key: "hosting_provider",
    label: "基础设施服务提供者",
    hint: "承载本实例的云服务商或者机房名称。自建机房填自有机房及其所在地。",
    example: "阿里云计算有限公司",
    required: true,
  },
  {
    key: "storage_region",
    label: "数据存储地域",
    hint: "数据库与文件实际所在的地域，精确到可核查的粒度。",
    example: "中华人民共和国境内（华东 1 可用区）",
    required: true,
  },
  {
    key: "geo_providers",
    label: "已启用的 IP 归属地提供方",
    hint: "与环境变量 VERHUB_GEO_PROVIDERS 的实际取值保持一致；未配置即为条款表中全部六家。",
    example: "太平洋科技、纯真网络",
    required: true,
  },
  {
    key: "detail_retention",
    label: "明细数据的留存期限",
    hint: "反馈、日志、行为记录的留存安排。本实例不自动清理明细数据，须如实写明由谁、多久清理一次。",
    example: "自提交之日起保留 12 个月，到期后由我们按月清理",
    required: true,
  },
  {
    key: "response_days",
    label: "权利请求的响应期限",
    hint: "承诺的答复时限，不宜长于 15 个工作日。",
    example: "15 个工作日",
    required: true,
  },
]

export const TERMS_PLACEHOLDERS: Record<string, TermsPlaceholder> = Object.fromEntries(
  REGISTRY.map((item) => [item.key, item]),
)

/** 只认小写字母、数字与下划线：与反馈 Issue 模板的变量写法一致。 */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/g

/** 按正文中的出现顺序去重列出占位符，未登记的键直接抛错。 */
export function resolvePlaceholders(content: string): TermsPlaceholder[] {
  const seen = new Set<string>()
  const resolved: TermsPlaceholder[] = []

  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1]
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)

    const placeholder = TERMS_PLACEHOLDERS[key]
    if (!placeholder) {
      throw new Error(`Unregistered terms placeholder: ${key}`)
    }
    resolved.push(placeholder)
  }

  return resolved
}

import { toast } from "sonner"

/**
 * 复制到剪贴板并给出 toast 反馈。
 *
 * 剪贴板在非安全上下文（http 且非 localhost）里会直接抛错，而后台常被部署在内网
 * http 上 —— 所以失败必须提示"请手动复制"，静默失败会让人以为复制成功了。
 */
export async function copyToClipboard(value: string, successMessage = "已复制。"): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error("复制失败，请手动选中复制。")
  }
}

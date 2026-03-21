import type { ApiParamDoc } from "@/lib/api-docs/types"

type Props = {
  title: string
  items: ApiParamDoc[]
}

export function ApiParameterTable({ title, items }: Props) {
  if (!items.length) {
    return null
  }

  return (
    <section className="space-y-2">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100/70 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
            <tr>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">必填</th>
              <th className="px-3 py-2">说明</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.name} className="border-t border-slate-200/80 dark:border-white/10">
                <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-100">
                  {item.name}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.type}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  {item.required ? "是" : "否"}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

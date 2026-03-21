type Props = {
  title: string
  language: "json" | "text"
  content: string
}

export function CodeBlock({ title, language, content }: Props) {
  return (
    <section className="space-y-2">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100 dark:border-white/10">
        <code className={`language-${language}`}>{content}</code>
      </pre>
    </section>
  )
}

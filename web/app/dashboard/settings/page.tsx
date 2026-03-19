"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"

import { getAdminProfile, updateAdminProfile } from "@/lib/auth-api"

export default function AdminSettingsPage() {
  const [username, setUsername] = React.useState("")
  const [nextUsername, setNextUsername] = React.useState("")
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [message, setMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      const profile = await getAdminProfile()
      if (cancelled) {
        return
      }

      setUsername(profile.username)
      setNextUsername(profile.username)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    const payload = {
      current_password: currentPassword,
      username: nextUsername.trim() || undefined,
      new_password: newPassword.trim() || undefined,
    }

    try {
      const updated = await updateAdminProfile(payload)
      setUsername(updated.username)
      setCurrentPassword("")
      setNewPassword("")
      setMessage("管理员信息已更新")
    } catch (error) {
      if (error instanceof Error) {
        setMessage(error.message)
      } else {
        setMessage("更新失败")
      }
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">管理员账户设置</h2>
        <p className="mt-2 text-sm text-slate-300">当前管理员：{username || "加载中..."}</p>
      </header>

      <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <form className="grid gap-3 md:max-w-xl" onSubmit={handleSubmit}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">管理员账号</span>
            <input
              value={nextUsername}
              onChange={(event) => setNextUsername(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-300">当前密码（必填）</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-300">新密码（可选）</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2"
            />
          </label>

          <Button type="submit" className="mt-2 w-fit">
            保存变更
          </Button>
        </form>

        {message ? <p className="mt-3 text-sm text-cyan-200">{message}</p> : null}
      </article>
    </section>
  )
}

"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { getAdminProfile, updateAdminProfile } from "@/lib/auth-api"
import { clearSessionToken } from "@/lib/auth-session"

export default function AdminSettingsPage() {
  const router = useRouter()
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
      await updateAdminProfile(payload)
      setCurrentPassword("")
      setNewPassword("")
      setMessage("管理员信息已更新，请重新登录")
      clearSessionToken()
      router.replace("/login")
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
      <AdminPageHeader
        title="管理员账户设置"
        description="修改管理员账号与密码。保存后需使用新凭据重新登录。"
        badge="Verhub Settings"
      />

      <AdminCard>
        <form className="grid gap-3 md:max-w-xl" onSubmit={handleSubmit}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">管理员账号</span>
            <input
              value={nextUsername}
              onChange={(event) => setNextUsername(event.target.value)}
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 dark:border-white/20 dark:bg-white/5"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">当前密码（必填）</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 dark:border-white/20 dark:bg-white/5"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">新密码（可选）</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 dark:border-white/20 dark:bg-white/5"
            />
          </label>

          <Button type="submit" className="mt-2 w-fit">
            保存变更
          </Button>
        </form>

        {message ? <p className="mt-3 text-sm text-cyan-200">{message}</p> : null}
      </AdminCard>
    </section>
  )
}

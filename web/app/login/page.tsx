"use client"

import * as React from "react"
import { Suspense } from "react"
import { LockKeyhole, ShieldCheck } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { ApiError } from "@/lib/api-client"
import { loginWithPassword } from "@/lib/auth-api"
import { normalizeReturnTo, setSessionToken } from "@/lib/auth-session"
import { ThemeLogo } from "@/components/branding/theme-logo"

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return "登录失败，请稍后重试。"
}

function LoginPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const response = await loginWithPassword(username.trim(), password)
      setSessionToken(response.access_token, response.expires_in)
      const nextPath = normalizeReturnTo(searchParams.get("returnTo"))
      router.replace(nextPath)
    } catch (loginError) {
      setError(toMessage(loginError))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-40 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute top-20 -right-24 h-104 w-104 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,255,255,0.15),transparent_40%),radial-gradient(circle_at_90%_30%,rgba(56,189,248,0.18),transparent_35%)]" />
      </div>

      <div className="relative flex min-h-svh items-center justify-center px-5 py-10 sm:px-8 md:py-16">
        <div className="w-full max-w-5xl">
          <section className="rounded-3xl border border-slate-900/10 bg-white/75 p-4 shadow-2xl backdrop-blur-xl sm:p-6 lg:p-8 dark:border-white/15 dark:bg-black/35">
            <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-stretch">
              <div className="relative overflow-hidden rounded-2xl border-slate-900/10 bg-white/80 px-6 py-10 lg:py-15 dark:border-white/15 dark:bg-white/5">
                <div className="space-y-4 md:space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-600/30 bg-cyan-100/60 px-3 py-1 text-xs tracking-[0.2em] text-cyan-800 uppercase dark:border-cyan-200/30 dark:bg-cyan-200/10 dark:text-cyan-100">
                    <ShieldCheck className="size-3.5" />
                    Verhub Admin
                  </div>
                  <h1 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl md:text-[2.6rem]">
                    登录
                  </h1>
                  <p className="max-w-md text-sm leading-relaxed text-slate-700 sm:text-base dark:text-slate-200/90">
                    Verhub后台管理页面
                  </p>
                </div>
                <div className="absolute -right-25 -bottom-25 -z-20 opacity-30">
                  <ThemeLogo imgClassName="h-full" alt="Verhub" width={300} height={300} />
                </div>
              </div>
              <div className="rounded-2xl border-slate-900/10 bg-white/80 px-6 py-10 lg:py-15 dark:border-white/15 dark:bg-white/5">
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <label className="block space-y-1 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">管理员账号</span>
                    <input
                      required
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 dark:border-white/20 dark:bg-white/5"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">管理员密码</span>
                    <input
                      required
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 dark:border-white/20 dark:bg-white/5"
                    />
                  </label>
                  {error ? <p className="text-sm text-rose-300">{error}</p> : null}
                  <Button type="submit" disabled={pending} className="w-full">
                    <LockKeyhole className="size-4" />
                    {pending ? "登录中..." : "登录后台"}
                  </Button>
                </form>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function PageFallback() {
  return <main className="min-h-svh bg-slate-100 dark:bg-slate-950" />
}

export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}

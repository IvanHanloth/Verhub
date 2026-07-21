/** Shared types for the GitHub webhook module. */

/** Release object inside a `release` event payload. Mirrors the REST release resource. */
export type GithubWebhookRelease = {
  tag_name?: string
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  published_at?: string
  created_at?: string
  html_url?: string
  zipball_url?: string
  assets?: Array<{ name?: string; browser_download_url?: string }>
}

/** Body of a `release` event delivery. */
export type GithubReleaseEventPayload = {
  action?: string
  release?: GithubWebhookRelease
  repository?: { full_name?: string; name?: string; owner?: { login?: string } }
}

/** Outcome reported back to GitHub, visible in the repository's delivery log. */
export type GithubWebhookResult = {
  /** `synced` wrote a version; `ignored` deliberately did nothing. */
  status: "synced" | "ignored" | "pong"
  /** Machine-readable explanation, only present for `ignored`. */
  reason?: string
  event?: string
  action?: string
  version?: string
  created?: boolean
}

/** Admin-facing webhook configuration state. Never exposes the secret itself. */
export type GithubWebhookSettings = {
  enabled: boolean
  /** Path to configure in GitHub, relative to the deployment's public origin. */
  payload_path: string
  content_type: "application/json"
  /** Last 4 characters of the secret, or null when none is configured. */
  secret_hint: string | null
  secret_updated_at: number | null
}

/** Returned once when a secret is created, so it can be pasted into GitHub. */
export type GithubWebhookSecretRevealed = GithubWebhookSettings & {
  secret: string
}

import { createHmac } from "node:crypto"

import { CommentCommandsService, parseCommand } from "./comment-commands.service"

function sign(secret: string, body: Buffer): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

const SECRET = "app-webhook-secret"

function createService(overrides?: {
  config?: Partial<Record<string, unknown>>
  featureEnabled?: boolean
  integration?: Record<string, unknown> | null
  dispatch?: jest.Mock
}) {
  const dispatch = overrides?.dispatch ?? jest.fn().mockResolvedValue(undefined)
  const configService = {
    getRecord: jest.fn().mockResolvedValue({ webhookSecret: SECRET, ...overrides?.config }),
    isFeatureEnabled: jest.fn().mockResolvedValue(overrides?.featureEnabled ?? true),
  }
  const integrationService = {
    findByRepoForCommands: jest.fn().mockResolvedValue(
      overrides?.integration === undefined
        ? {
            projectKey: "verhub",
            commandAllowedAssociations: ["OWNER", "MEMBER", "COLLABORATOR"],
            commandAllowedUsers: [],
            commands: [{ name: "release", workflow: "release.yml", ref: "main" }],
          }
        : overrides.integration,
    ),
  }
  const client = { dispatchWorkflow: dispatch }
  const service = new CommentCommandsService(
    configService as never,
    integrationService as never,
    client as never,
  )
  return { service, dispatch, integrationService }
}

function makeDelivery(payload: Record<string, unknown>, event = "issue_comment") {
  const rawBody = Buffer.from(JSON.stringify(payload))
  return {
    event,
    signature: sign(SECRET, rawBody),
    deliveryId: "d-1",
    rawBody,
    body: payload,
  }
}

const basePayload = {
  action: "created",
  repository: { full_name: "acme/app" },
  comment: {
    body: "/verhub-release 3.2.0",
    author_association: "OWNER",
    user: { login: "alice" },
  },
}

describe("parseCommand", () => {
  it("parses name and args from the first non-empty line", () => {
    expect(parseCommand("\n  /verhub-release 3.2.0 \nrest")).toEqual({
      name: "release",
      args: "3.2.0",
    })
  })

  it("ignores commands quoted mid-comment", () => {
    expect(parseCommand("试试这个：\n/verhub-release 1.0")).toBeNull()
  })

  it("allows empty args", () => {
    expect(parseCommand("/verhub-deploy")).toEqual({ name: "deploy", args: "" })
  })

  it("returns null for plain comments", () => {
    expect(parseCommand("looks good to me")).toBeNull()
    expect(parseCommand(undefined)).toBeNull()
  })
})

describe("CommentCommandsService", () => {
  it("dispatches the mapped workflow with args as input", async () => {
    const { service, dispatch } = createService()
    const result = await service.handleDelivery(makeDelivery(basePayload))

    expect(result.status).toBe("dispatched")
    expect(result.project_key).toBe("verhub")
    expect(dispatch).toHaveBeenCalledWith("acme/app", "release.yml", "main", { args: "3.2.0" })
  })

  it("uses the configured input name when present", async () => {
    const { service, dispatch } = createService({
      integration: {
        projectKey: "verhub",
        commandAllowedAssociations: ["OWNER"],
        commandAllowedUsers: [],
        commands: [{ name: "release", workflow: "release.yml", ref: "main", input: "version" }],
      },
    })
    await service.handleDelivery(makeDelivery(basePayload))
    expect(dispatch).toHaveBeenCalledWith("acme/app", "release.yml", "main", { version: "3.2.0" })
  })

  it("rejects a bad signature", async () => {
    const { service } = createService()
    const delivery = makeDelivery(basePayload)
    delivery.signature = "sha256=deadbeef"
    await expect(service.handleDelivery(delivery)).rejects.toThrow("signature")
  })

  it("answers ping", async () => {
    const { service } = createService()
    const result = await service.handleDelivery(makeDelivery({}, "ping"))
    expect(result.status).toBe("pong")
  })

  it("ignores authors outside associations and user allowlist", async () => {
    const { service, dispatch } = createService()
    const payload = {
      ...basePayload,
      comment: { ...basePayload.comment, author_association: "NONE", user: { login: "mallory" } },
    }
    const result = await service.handleDelivery(makeDelivery(payload))
    expect(result).toMatchObject({ status: "ignored", reason: "author_not_allowed" })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("allows an explicitly allowlisted user regardless of association", async () => {
    const { service, dispatch } = createService({
      integration: {
        projectKey: "verhub",
        commandAllowedAssociations: ["OWNER"],
        commandAllowedUsers: ["Bob"],
        commands: [{ name: "release", workflow: "release.yml", ref: "main" }],
      },
    })
    const payload = {
      ...basePayload,
      comment: { ...basePayload.comment, author_association: "NONE", user: { login: "bob" } },
    }
    const result = await service.handleDelivery(makeDelivery(payload))
    expect(result.status).toBe("dispatched")
    expect(dispatch).toHaveBeenCalled()
  })

  it("ignores edited comments", async () => {
    const { service, dispatch } = createService()
    const result = await service.handleDelivery(makeDelivery({ ...basePayload, action: "edited" }))
    expect(result).toMatchObject({ status: "ignored", reason: "unsupported_action" })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("ignores unknown commands", async () => {
    const { service, dispatch } = createService()
    const payload = {
      ...basePayload,
      comment: { ...basePayload.comment, body: "/verhub-nuke everything" },
    }
    const result = await service.handleDelivery(makeDelivery(payload))
    expect(result).toMatchObject({ status: "ignored", reason: "unknown_command" })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("ignores everything when the instance feature is disabled", async () => {
    const { service, dispatch } = createService({ featureEnabled: false })
    const result = await service.handleDelivery(makeDelivery(basePayload))
    expect(result).toMatchObject({ status: "ignored", reason: "feature_disabled" })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("ignores repos no project has configured", async () => {
    const { service } = createService({ integration: null })
    const result = await service.handleDelivery(makeDelivery(basePayload))
    expect(result).toMatchObject({ status: "ignored", reason: "repo_not_configured" })
  })
})

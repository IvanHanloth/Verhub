import { BadRequestException, HttpException, ServiceUnavailableException } from "@nestjs/common"

import { FeedbackForwardThrottler } from "./feedback-forward-throttler"
import { FeedbackIssueService } from "./feedback-issue.service"
import {
  BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
  BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
  parseRepoTemplateFile,
  renderTemplate,
} from "./feedback-issue-template"

const feedback = {
  id: "fb-1",
  content: "更新后无法启动",
  rating: 2,
  contact: "user@example.com",
  user_id: "u1",
  platform: "windows",
  platform_version: "11",
  created_at: 1767225600,
}

const BUILTIN_TEMPLATE = {
  title: BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
  body: BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
}

function createService(overrides?: {
  active?: boolean
  integration?: Record<string, unknown> | null
  instanceTemplate?: { title: string; body: string }
  createIssue?: jest.Mock
  getFileContent?: jest.Mock
}) {
  const createIssue =
    overrides?.createIssue ??
    jest.fn().mockResolvedValue({ number: 1, url: "https://github.com/acme/app/issues/1" })
  const getFileContent = overrides?.getFileContent ?? jest.fn().mockResolvedValue(null)
  const prisma = {
    project: { findUnique: jest.fn().mockResolvedValue({ name: "Verhub" }) },
  }
  const integrationService = {
    isFeedbackIssueActive: jest.fn().mockResolvedValue(overrides?.active ?? true),
    getRecord: jest.fn().mockResolvedValue(
      overrides?.integration === undefined
        ? {
            repoFullName: "acme/app",
            feedbackIssueTemplateSource: "inherit",
            feedbackIssueTemplateRepoPath: null,
            feedbackIssueTemplateRepoRef: null,
            feedbackIssueTitleTemplate: null,
            feedbackIssueBodyTemplate: null,
            feedbackIssueLabels: ["feedback"],
          }
        : overrides.integration,
    ),
  }
  const configService = {
    getInstanceTemplate: jest
      .fn()
      .mockResolvedValue(overrides?.instanceTemplate ?? BUILTIN_TEMPLATE),
  }
  const client = { createIssue, getFileContent }
  const service = new FeedbackIssueService(
    prisma as never,
    integrationService as never,
    configService as never,
    client as never,
    new FeedbackForwardThrottler(),
  )
  return { service, createIssue, getFileContent }
}

describe("renderTemplate", () => {
  it("substitutes known variables and keeps unknown ones", () => {
    expect(
      renderTemplate("{{content}} / {{ rating }} / {{nope}}", { content: "a", rating: "5" }),
    ).toBe("a / 5 / {{nope}}")
  })
})

describe("parseRepoTemplateFile", () => {
  it("treats a plain markdown file as the body and keeps the builtin title", () => {
    const parsed = parseRepoTemplateFile("# 反馈\n\n{{content}}\n")
    expect(parsed.title).toBe(BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE)
    expect(parsed.body).toBe("# 反馈\n\n{{content}}")
    expect(parsed.labels).toBeUndefined()
  })

  it("reads title and labels from front matter", () => {
    const parsed = parseRepoTemplateFile(
      ["---", "title: [FB] {{content_head}}", "labels: feedback, triage", "---", "正文"].join("\n"),
    )
    expect(parsed).toEqual({
      title: "[FB] {{content_head}}",
      body: "正文",
      labels: ["feedback", "triage"],
    })
  })
})

describe("FeedbackIssueService", () => {
  it("only constrains submissions that asked for forwarding", async () => {
    const { service } = createService({ active: true })
    await expect(
      service.assertForwardAllowed("p", { forward: false, contact: "" }),
    ).resolves.toBeUndefined()
    await expect(
      service.assertForwardAllowed("p", { forward: true, contact: "" }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.assertForwardAllowed("p", { forward: true, contact: "user@example.com" }),
    ).resolves.toBeUndefined()
  })

  it("rejects forwarding when the project does not offer it", async () => {
    const { service } = createService({ active: false })
    await expect(
      service.assertForwardAllowed("p", { forward: true, contact: "user@example.com" }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("throttles repeated forwards from one address", async () => {
    process.env.VERHUB_GITHUB_FORWARD_RATE_LIMIT = "2"
    try {
      const { service } = createService()
      const attempt = () =>
        service.assertForwardAllowed("p", { forward: true, contact: "a@b.c", ip: "1.2.3.4" })
      await expect(attempt()).resolves.toBeUndefined()
      await expect(attempt()).resolves.toBeUndefined()
      await expect(attempt()).rejects.toBeInstanceOf(HttpException)

      // 额度按 IP 分桶，另一个地址不受影响。
      await expect(
        service.assertForwardAllowed("p", { forward: true, contact: "a@b.c", ip: "5.6.7.8" }),
      ).resolves.toBeUndefined()
    } finally {
      delete process.env.VERHUB_GITHUB_FORWARD_RATE_LIMIT
    }
  })

  it("creates an issue with the builtin template, which carries no rating", async () => {
    const { service, createIssue } = createService()
    const issue = await service.forward("verhub", feedback)

    expect(issue).toEqual({ number: 1, url: "https://github.com/acme/app/issues/1" })
    expect(createIssue).toHaveBeenCalledTimes(1)
    const [repo, input] = createIssue.mock.calls[0] as [
      string,
      { title: string; body: string; labels?: string[] },
    ]
    expect(repo).toBe("acme/app")
    expect(input.title).toContain("更新后无法启动")
    expect(input.body).toContain("user@example.com")
    expect(input.body).toContain("`fb-1`")
    expect(input.body).not.toContain("评分")
    expect(input.labels).toEqual(["feedback"])
  })

  it("uses the project template only when the source says custom", async () => {
    const base = {
      repoFullName: "acme/app",
      feedbackIssueTemplateRepoPath: null,
      feedbackIssueTemplateRepoRef: null,
      feedbackIssueTitleTemplate: "P:{{feedback_id}}",
      feedbackIssueBodyTemplate: "正文 {{content}}",
      feedbackIssueLabels: [],
    }
    const instanceTemplate = { title: "I:{{feedback_id}}", body: "实例 {{content}}" }

    const custom = createService({
      integration: { ...base, feedbackIssueTemplateSource: "custom" },
      instanceTemplate,
    })
    await custom.service.forward("verhub", feedback)
    expect((custom.createIssue.mock.calls[0] as [string, { title: string }])[1].title).toBe(
      "P:fb-1",
    )

    const inherit = createService({
      integration: { ...base, feedbackIssueTemplateSource: "inherit" },
      instanceTemplate,
    })
    await inherit.service.forward("verhub", feedback)
    expect((inherit.createIssue.mock.calls[0] as [string, { title: string }])[1].title).toBe(
      "I:fb-1",
    )
  })

  it("pulls the template from the repository when the source says repo", async () => {
    const getFileContent = jest
      .fn()
      .mockResolvedValue("---\ntitle: R:{{feedback_id}}\nlabels: from-repo\n---\n仓库 {{content}}")
    const { service, createIssue } = createService({
      integration: {
        repoFullName: "acme/app",
        feedbackIssueTemplateSource: "repo",
        feedbackIssueTemplateRepoPath: ".github/verhub-feedback.md",
        feedbackIssueTemplateRepoRef: "main",
        feedbackIssueTitleTemplate: "P:{{feedback_id}}",
        feedbackIssueBodyTemplate: "正文",
        feedbackIssueLabels: ["ignored"],
      },
      getFileContent,
    })

    await service.forward("verhub", feedback)
    const [, input] = createIssue.mock.calls[0] as [
      string,
      { title: string; body: string; labels?: string[] },
    ]
    expect(getFileContent).toHaveBeenCalledWith("acme/app", ".github/verhub-feedback.md", "main")
    expect(input.title).toBe("R:fb-1")
    expect(input.body).toBe("仓库 更新后无法启动")
    // 模板自带标签优先于项目上单独配置的标签。
    expect(input.labels).toEqual(["from-repo"])
  })

  it("falls back to the instance template when the repository file is gone", async () => {
    const { service, createIssue } = createService({
      integration: {
        repoFullName: "acme/app",
        feedbackIssueTemplateSource: "repo",
        feedbackIssueTemplateRepoPath: ".github/missing.md",
        feedbackIssueTemplateRepoRef: null,
        feedbackIssueTitleTemplate: null,
        feedbackIssueBodyTemplate: null,
        feedbackIssueLabels: [],
      },
      instanceTemplate: { title: "I:{{feedback_id}}", body: "实例" },
      getFileContent: jest.fn().mockRejectedValue(new Error("404")),
    })
    await service.forward("verhub", feedback)
    expect((createIssue.mock.calls[0] as [string, { title: string }])[1].title).toBe("I:fb-1")
  })

  it("reports why a repository template preview failed", async () => {
    const { service } = createService({
      integration: {
        repoFullName: "acme/app",
        feedbackIssueTemplateSource: "repo",
        feedbackIssueTemplateRepoPath: ".github/missing.md",
        feedbackIssueTemplateRepoRef: null,
        feedbackIssueTitleTemplate: null,
        feedbackIssueBodyTemplate: null,
        feedbackIssueLabels: [],
      },
      getFileContent: jest.fn().mockRejectedValue(new Error("GitHub API responded 404")),
    })
    const preview = await service.previewRepoTemplate("verhub")
    expect(preview.error).toContain("404")
    expect(preview.body_template).toBeNull()
  })

  it("refuses to forward when the project stopped offering it", async () => {
    const { service, createIssue } = createService({ active: false })
    await expect(service.forward("verhub", feedback)).rejects.toBeInstanceOf(BadRequestException)
    expect(createIssue).not.toHaveBeenCalled()
  })

  it("surfaces GitHub failures so the submission can be rolled back", async () => {
    const { service } = createService({
      createIssue: jest.fn().mockRejectedValue(new Error("github down")),
    })
    await expect(service.forward("verhub", feedback)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})

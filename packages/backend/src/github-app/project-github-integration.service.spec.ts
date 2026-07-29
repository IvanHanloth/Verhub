import { BadRequestException, NotFoundException } from "@nestjs/common"
import { makeResolver } from "../../test/project-resolver.testkit"

import { ProjectGithubIntegrationService } from "./project-github-integration.service"

function createPrismaMock() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ projectKey: "verhub" }) },
    projectGithubIntegration: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      upsert: jest.fn().mockImplementation(({ create, update }) => ({
        projectKey: "verhub",
        repoFullName: null,
        feedbackIssueEnabled: false,
        feedbackIssueTitleTemplate: null,
        feedbackIssueBodyTemplate: null,
        feedbackIssueLabels: [],
        commentCommandsEnabled: false,
        commandAllowedAssociations: ["OWNER", "MEMBER", "COLLABORATOR"],
        commandAllowedUsers: [],
        commands: null,
        updatedAt: 1,
        ...create,
        ...update,
      })),
    },
  }
}

function createConfigMock(overrides?: { featureEnabled?: boolean; configured?: boolean }) {
  const configured = overrides?.configured ?? true
  return {
    isFeatureEnabled: jest.fn().mockResolvedValue(overrides?.featureEnabled ?? true),
    getRecord: jest.fn().mockResolvedValue({
      appId: configured ? "1" : null,
      privateKeyEncrypted: configured ? "v1:a:b:c" : null,
      enabledFeatures:
        overrides?.featureEnabled === false ? [] : ["feedback_issue", "comment_commands"],
    }),
  }
}

function createService(overrides?: Parameters<typeof createConfigMock>[0]) {
  const prisma = createPrismaMock()
  const config = createConfigMock(overrides)
  const service = new ProjectGithubIntegrationService(
    prisma as never,
    makeResolver(prisma),
    config as never,
  )
  return { service, prisma, config }
}

describe("ProjectGithubIntegrationService", () => {
  it("refuses to enable feedback forwarding when the instance feature is off", async () => {
    const { service } = createService({ featureEnabled: false })
    await expect(
      service.update("verhub", { feedback_issue_enabled: true, repo_full_name: "acme/app" }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("refuses to enable a feature without a repo", async () => {
    const { service } = createService()
    await expect(service.update("verhub", { feedback_issue_enabled: true })).rejects.toThrow(
      "repo_full_name",
    )
  })

  it("enables forwarding with repo and instance feature on", async () => {
    const { service } = createService()
    const view = await service.update("verhub", {
      repo_full_name: "acme/app",
      feedback_issue_enabled: true,
    })
    expect(view.feedback_issue_enabled).toBe(true)
    expect(view.feedback_issue_active).toBe(true)
  })

  it("disabling never requires the instance feature", async () => {
    const { service } = createService({ featureEnabled: false })
    const view = await service.update("verhub", { feedback_issue_enabled: false })
    expect(view.feedback_issue_enabled).toBe(false)
  })

  it("clearing the repo turns dependent switches off", async () => {
    const { service, prisma } = createService()
    prisma.projectGithubIntegration.findUnique.mockResolvedValue({
      projectKey: "verhub",
      repoFullName: "acme/app",
      feedbackIssueEnabled: true,
      commentCommandsEnabled: true,
    })
    await service.update("verhub", { repo_full_name: "" })
    const upsert = prisma.projectGithubIntegration.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }
    expect(upsert.update.feedbackIssueEnabled).toBe(false)
    expect(upsert.update.commentCommandsEnabled).toBe(false)
    expect(upsert.update.repoFullName).toBeNull()
  })

  it("rejects duplicate command names", async () => {
    const { service } = createService()
    await expect(
      service.update("verhub", {
        commands: [
          { name: "release", workflow: "a.yml", ref: "main" },
          { name: "release", workflow: "b.yml", ref: "main" },
        ],
      }),
    ).rejects.toThrow("Duplicate command name")
  })

  it("view reports active=false when instance credentials are missing", async () => {
    const { service, prisma } = createService({ configured: false, featureEnabled: false })
    prisma.projectGithubIntegration.findUnique.mockResolvedValue({
      projectKey: "verhub",
      repoFullName: "acme/app",
      feedbackIssueEnabled: true,
      feedbackIssueTitleTemplate: null,
      feedbackIssueBodyTemplate: null,
      feedbackIssueLabels: [],
      commentCommandsEnabled: true,
      commandAllowedAssociations: ["OWNER"],
      commandAllowedUsers: [],
      commands: null,
      updatedAt: 1,
    })

    const view = await service.getView("verhub")
    expect(view.feedback_issue_enabled).toBe(true)
    expect(view.feedback_issue_active).toBe(false)
    expect(view.comment_commands_active).toBe(false)
  })

  it("throws for an unknown project", async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue(null)
    await expect(service.getView("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("isFeedbackIssueActive combines project and instance state", async () => {
    const { service, prisma, config } = createService()
    prisma.projectGithubIntegration.findUnique.mockResolvedValue({
      feedbackIssueEnabled: true,
      repoFullName: "acme/app",
    })
    await expect(service.isFeedbackIssueActive("verhub")).resolves.toBe(true)

    config.isFeatureEnabled.mockResolvedValue(false)
    await expect(service.isFeedbackIssueActive("verhub")).resolves.toBe(false)

    prisma.projectGithubIntegration.findUnique.mockResolvedValue(null)
    await expect(service.isFeedbackIssueActive("verhub")).resolves.toBe(false)
  })
})

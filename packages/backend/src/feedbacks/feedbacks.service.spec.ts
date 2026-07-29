import { NotFoundException } from "@nestjs/common"
import { makeResolver } from "../../test/project-resolver.testkit"

import { FeedbacksService } from "./feedbacks.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
    },
    feedback: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  }
}

/** 转发服务的空实现：默认放行校验、转发成功并给出一个 Issue 号。 */
function createForwarderMock() {
  return {
    assertForwardAllowed: jest.fn().mockResolvedValue(undefined),
    forward: jest
      .fn()
      .mockResolvedValue({ number: 7, url: "https://github.com/acme/app/issues/7" }),
    getPublicOptions: jest.fn().mockResolvedValue({
      project_key: "verhub",
      github_forward_available: false,
      contact_required_for_forward: false,
    }),
  }
}

/** No-origin baseline: what the service sees when nothing could be observed. */
const emptyOrigin = {
  ip: null,
  userAgent: null,
  countryCode: null,
  countryName: null,
  regionName: null,
  city: null,
  platform: null,
  platformVersion: null,
}

describe("FeedbacksService", () => {
  it("creates feedback from project key", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockResolvedValue({
      id: "feedback-1",
      userId: "user-1",
      rating: 5,
      content: "great release",
      platform: "WEB",
      customData: { channel: "web" },
      createdAt: 1767225600,
    })

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.createByProjectKey(
      "verhub",
      {
        user_id: "user-1",
        rating: 5,
        content: "great release",
        platform: "web",
        custom_data: { channel: "web" },
      },
      emptyOrigin,
    )

    expect(result.id).toBe("feedback-1")
    expect(result.platform).toBe("web")
    expect(result.created_at).toBe(1767225600)
  })

  it("stores contact and the hidden flag on submit", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-3",
      createdAt: 1767225600,
    }))

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.createByProjectKey(
      "verhub",
      { content: "崩溃了", contact: "user@example.com", is_hidden: true },
      emptyOrigin,
    )

    expect(result.contact).toBe("user@example.com")
    expect(result.is_hidden).toBe(true)
  })

  it("defaults the hidden flag to false when the client omits it", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-4",
      createdAt: 1767225600,
    }))

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.createByProjectKey("verhub", { content: "还行" }, emptyOrigin)

    expect(result.is_hidden).toBe(false)
    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contact: undefined, isHidden: false }),
      }),
    )
  })

  it("rejects a submission whose forward request fails validation", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    const forwarder = createForwarderMock()
    forwarder.assertForwardAllowed.mockRejectedValue(new Error("contact is required"))

    const service = new FeedbacksService(prisma as never, makeResolver(prisma), forwarder as never)
    await expect(
      service.createByProjectKey(
        "verhub",
        { content: "打不开", forward_to_github: true },
        emptyOrigin,
      ),
    ).rejects.toThrow("contact is required")
    expect(prisma.feedback.create).not.toHaveBeenCalled()
  })

  it("forwards only when the submitter asked for it", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-fwd",
      createdAt: 1767225600,
    }))
    prisma.feedback.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-fwd",
      content: "打不开",
      createdAt: 1767225600,
    }))
    const forwarder = createForwarderMock()

    const service = new FeedbacksService(prisma as never, makeResolver(prisma), forwarder as never)
    await service.createByProjectKey(
      "verhub",
      { content: "打不开", contact: "user@example.com" },
      emptyOrigin,
    )
    expect(forwarder.forward).not.toHaveBeenCalled()

    await service.createByProjectKey(
      "verhub",
      { content: "打不开", contact: "user@example.com", forward_to_github: true },
      emptyOrigin,
    )
    expect(forwarder.forward).toHaveBeenCalledWith(
      "verhub",
      expect.objectContaining({ id: "feedback-fwd", contact: "user@example.com" }),
    )
  })

  it("records the created issue on the forwarded feedback", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-fwd",
      createdAt: 1767225600,
    }))
    prisma.feedback.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-fwd",
      content: "打不开",
      createdAt: 1767225600,
    }))

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.createByProjectKey(
      "verhub",
      { content: "打不开", contact: "user@example.com", forward_to_github: true },
      emptyOrigin,
    )

    expect(prisma.feedback.update).toHaveBeenCalledWith({
      where: { id: "feedback-fwd" },
      data: {
        forwardedToGithub: true,
        githubIssueNumber: 7,
        githubIssueUrl: "https://github.com/acme/app/issues/7",
      },
    })
    expect(result.forwarded_to_github).toBe(true)
    expect(result.github_issue_number).toBe(7)
    expect(result.github_issue_url).toBe("https://github.com/acme/app/issues/7")
  })

  it("keeps no record when the issue could not be created", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-fwd",
      createdAt: 1767225600,
    }))
    prisma.feedback.delete.mockResolvedValue({})
    const forwarder = createForwarderMock()
    forwarder.forward.mockRejectedValue(new Error("github down"))

    const service = new FeedbacksService(prisma as never, makeResolver(prisma), forwarder as never)
    await expect(
      service.createByProjectKey(
        "verhub",
        { content: "打不开", contact: "user@example.com", forward_to_github: true },
        emptyOrigin,
      ),
    ).rejects.toThrow("github down")

    expect(prisma.feedback.delete).toHaveBeenCalledWith({ where: { id: "feedback-fwd" } })
    expect(prisma.feedback.update).not.toHaveBeenCalled()
  })

  it("skips dedup and origin capture when an admin backfills a feedback", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-manual",
      customData: null,
      ip: null,
      userAgent: null,
      countryCode: null,
      countryName: null,
      regionName: null,
      city: null,
      createdAt: 1767225600,
    }))

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.createByAdmin("verhub", {
      content: "线下收集的意见",
      rating: 4,
      platform: "windows",
    })

    expect(prisma.feedback.findFirst).not.toHaveBeenCalled()
    expect(result.ip).toBeNull()
    expect(result.rating).toBe(4)
    expect(result.platform).toBe("windows")
  })

  it("throws when project key does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )

    await expect(
      service.createByProjectKey(
        "unknown",
        {
          content: "feedback",
        },
        emptyOrigin,
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("falls back to the inferred platform when the client declares none", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "feedback-2",
      createdAt: 1767225600,
    }))

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.createByProjectKey(
      "verhub",
      { content: "nice" },
      { ...emptyOrigin, ip: "203.0.113.9", platform: "ANDROID" as never },
    )

    expect(result.platform).toBe("android")
    expect(result.ip).toBe("203.0.113.9")
  })

  it("getStatistics returns count, rate_count, rate_avg", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.count.mockResolvedValue(10)
    prisma.feedback.findMany.mockResolvedValue([{ rating: 4 }, { rating: 5 }, { rating: 3 }])

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const stats = await service.getStatistics()

    expect(stats.count).toBe(10)
    expect(stats.rate_count).toBe(3)
    expect(stats.rate_avg).toBe(4)
  })

  it("getStatistics returns null avg when no ratings", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.count.mockResolvedValue(5)
    prisma.feedback.findMany.mockResolvedValue([])

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const stats = await service.getStatistics()

    expect(stats.rate_avg).toBeNull()
    expect(stats.rate_count).toBe(0)
  })

  it("findAll lists feedbacks for a project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "f1",
          userId: "u1",
          rating: 5,
          content: "nice",
          platform: "WEB",
          customData: null,
          createdAt: 1000,
        },
      ],
    ])

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.findAll("proj", { limit: 10, offset: 0, include_hidden: false })

    expect(result.total).toBe(1)
    expect(result.data[0]?.platform).toBe("web")
  })

  it("findAll hides hidden feedbacks unless include_hidden is set", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([0, []])

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await service.findAll("proj", { limit: 10, offset: 0, include_hidden: false })
    expect(prisma.feedback.count).toHaveBeenCalledWith({
      where: { projectKey: "proj", isHidden: false },
    })

    await service.findAll("proj", { limit: 10, offset: 0, include_hidden: true })
    expect(prisma.feedback.count).toHaveBeenLastCalledWith({ where: { projectKey: "proj" } })
  })

  it("findAll throws when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await expect(
      service.findAll("missing", { limit: 10, offset: 0, include_hidden: false }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("findOne returns a single feedback", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue({
      id: "f1",
      userId: null,
      rating: 3,
      content: "ok",
      platform: null,
      platformVersion: null,
      customData: null,
      createdAt: 2000,
    })

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.findOne("proj", "f1")

    expect(result.id).toBe("f1")
    expect(result.platform).toBeNull()
  })

  it("findOne throws when feedback not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await expect(service.findOne("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("update modifies a feedback", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1", projectKey: "proj" })
    prisma.feedback.update.mockResolvedValue({
      id: "f1",
      userId: null,
      rating: 4,
      content: "updated",
      platform: "IOS",
      customData: null,
      createdAt: 2000,
    })

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.update("proj", "f1", {
      content: "updated",
      rating: 4,
      platform: "ios",
    })

    expect(result.content).toBe("updated")
    expect(result.platform).toBe("ios")
  })

  it("update throws when feedback not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await expect(service.update("proj", "missing", { content: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("remove deletes a feedback", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1" })
    prisma.feedback.delete.mockResolvedValue({})

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await service.remove("proj", "f1")

    expect(prisma.feedback.delete).toHaveBeenCalledWith({ where: { id: "f1" } })
  })

  it("remove throws when feedback not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await expect(service.remove("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("updateById delegates to update", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1", projectKey: "proj" })
    prisma.feedback.update.mockResolvedValue({
      id: "f1",
      userId: null,
      rating: null,
      content: "changed",
      platform: null,
      platformVersion: null,
      customData: null,
      createdAt: 3000,
    })

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    const result = await service.updateById("f1", { content: "changed" })

    expect(result.content).toBe("changed")
  })

  it("updateById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await expect(service.updateById("missing", { content: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("removeById delegates to remove", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1" })
    prisma.feedback.delete.mockResolvedValue({})

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await service.removeById("f1")

    expect(prisma.feedback.delete).toHaveBeenCalledWith({ where: { id: "f1" } })
  })

  it("removeById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    await expect(service.removeById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new FeedbacksService(
      prisma as never,
      makeResolver(prisma),
      createForwarderMock() as never,
    )
    expect(service.getStatus()).toEqual({ module: "feedbacks", implemented: true })
  })
})

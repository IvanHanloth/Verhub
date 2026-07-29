import { NotFoundException } from "@nestjs/common"

import { BUILTIN_TERMS_DOCUMENTS, TERMS_DOCUMENT_SLUGS } from "./terms-documents"
import { TermsService } from "./terms.service"

type DocumentRow = {
  slug: string
  custom: boolean
  content: string | null
  contentUpdatedAt: number | null
  updatedAt: number
}

const PRIVACY = BUILTIN_TERMS_DOCUMENTS["privacy-policy"]

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    slug: "privacy-policy",
    custom: false,
    content: null,
    contentUpdatedAt: null,
    updatedAt: 100,
    ...overrides,
  }
}

function createPrismaMock(records: DocumentRow[] = []) {
  return {
    termsDocument: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(records.find((item) => item.slug === where.slug) ?? null),
        ),
      findMany: jest.fn().mockResolvedValue(records),
      upsert: jest.fn().mockImplementation(({ where, create, update }) => ({
        ...row({ slug: where.slug }),
        ...create,
        ...update,
      })),
    },
  }
}

function upsertUpdate(prisma: ReturnType<typeof createPrismaMock>): Partial<DocumentRow> {
  const call = prisma.termsDocument.upsert.mock.calls[0]?.[0] as { update: Partial<DocumentRow> }
  return call.update
}

describe("TermsService", () => {
  it("serves the builtin text when nothing is configured", async () => {
    const service = new TermsService(createPrismaMock() as never)

    const document = await service.getDocument("privacy-policy")

    expect(document.source).toBe("builtin")
    expect(document.content).toBe(PRIVACY.content)
    expect(document.updated_at).toBe(PRIVACY.updatedAt)
    expect(document.title).toBe(PRIVACY.title)
  })

  it("lists every registered document without shipping the bodies", async () => {
    const service = new TermsService(createPrismaMock() as never)

    const summaries = await service.listDocumentSummaries()

    expect(summaries.map((item) => item.slug)).toEqual([...TERMS_DOCUMENT_SLUGS])
    expect(summaries[0]).not.toHaveProperty("content")
  })

  it("rejects a slug that is not registered", async () => {
    const service = new TermsService(createPrismaMock() as never)

    await expect(service.getDocument("terms-of-service")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("keeps the draft but serves the builtin text while the switch is off", async () => {
    const service = new TermsService(
      createPrismaMock([
        row({ custom: false, content: "# 自定义", contentUpdatedAt: 200 }),
      ]) as never,
    )

    expect((await service.getDocument("privacy-policy")).source).toBe("builtin")
    expect((await service.getConfigView("privacy-policy")).custom_content).toBe("# 自定义")
  })

  it("serves the custom text with its own timestamp once enabled", async () => {
    const service = new TermsService(
      createPrismaMock([
        row({ custom: true, content: "# 自定义", contentUpdatedAt: 200 }),
      ]) as never,
    )

    const document = await service.getDocument("privacy-policy")

    expect(document.source).toBe("custom")
    expect(document.content).toBe("# 自定义")
    expect(document.updated_at).toBe(200)
  })

  it("falls back to the builtin text when the switch is on but the draft is empty", async () => {
    const service = new TermsService(
      createPrismaMock([row({ custom: true, content: "   " })]) as never,
    )

    expect((await service.getDocument("privacy-policy")).source).toBe("builtin")
  })

  it("clears the draft when an empty body is saved", async () => {
    const prisma = createPrismaMock()
    const service = new TermsService(prisma as never)

    await service.updateDocument("privacy-policy", { content: "  " })

    expect(upsertUpdate(prisma).content).toBeNull()
    expect(upsertUpdate(prisma).contentUpdatedAt).toBeNull()
  })

  it("leaves the body timestamp alone when only the switch changes", async () => {
    const prisma = createPrismaMock()
    const service = new TermsService(prisma as never)

    await service.updateDocument("privacy-policy", { custom: true })

    expect(upsertUpdate(prisma)).not.toHaveProperty("contentUpdatedAt")
    expect(upsertUpdate(prisma).custom).toBe(true)
  })

  it("drops the draft on reset", async () => {
    const service = new TermsService(
      createPrismaMock([row({ custom: true, content: "# 自定义" })]) as never,
    )

    const view = await service.resetDocument("privacy-policy")

    expect(view.custom).toBe(false)
    expect(view.custom_content).toBeNull()
    expect(view.content).toBe(PRIVACY.content)
  })

  it("refuses to touch an unregistered slug", async () => {
    const prisma = createPrismaMock()
    const service = new TermsService(prisma as never)

    await expect(service.updateDocument("../etc/passwd", { custom: true })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(prisma.termsDocument.upsert).not.toHaveBeenCalled()
  })
})

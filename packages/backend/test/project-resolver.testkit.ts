import { NotFoundException } from "@nestjs/common"

/**
 * 单元测试用的项目解析器：用同一个 prisma mock 驱动。
 *
 * 命中项目（project.findUnique 非空）时返回归一化后的输入 key——与各服务原先
 * 直接用 normalizeProjectKey(input) 的行为一致，故已有断言无需改动；未命中再查
 * projectAlias，仍未命中则 resolveCanonicalKeyOrThrow 抛 404，保留原 ensureProject 语义。
 */
type ProjectMock = {
  project: { findUnique: jest.Mock }
  projectAlias?: { findUnique: jest.Mock }
}

export function makeResolver(prisma: ProjectMock) {
  const resolve = async (input: string): Promise<string | null> => {
    const key = input.trim().toLowerCase()
    const project = await prisma.project.findUnique({
      where: { projectKey: key },
      select: { projectKey: true },
    })
    // 只有显式 mock 成 null 才算「项目不存在」；未 mock（undefined）视为存在——
    // 真实 Prisma 找不到返回 null 而非 undefined，故仅影响单测，不改变生产解析语义。
    // 命中时返回归一化后的输入 key，与各服务原先直接用 normalizeProjectKey(input) 一致。
    if (project !== null) {
      return key
    }
    const alias = await prisma.projectAlias?.findUnique({ where: { alias: key } })
    return alias ? (alias as { projectKey: string }).projectKey : null
  }

  return {
    resolveCanonicalKey: resolve,
    resolveCanonicalKeyOrThrow: async (input: string): Promise<string> => {
      const key = await resolve(input)
      if (!key) {
        throw new NotFoundException("Project not found")
      }
      return key
    },
  } as never
}

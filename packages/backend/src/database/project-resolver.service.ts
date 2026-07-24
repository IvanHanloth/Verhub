import { Injectable, NotFoundException } from "@nestjs/common"

import { normalizeProjectKey } from "../common/utils"
import { PrismaService } from "./prisma.service"

/**
 * 把外部传入的 project key 解析成当前项目的规范 key。
 *
 * 项目改名（变更 projectKey）后，旧 key 会被登记为别名。任何以旧 key 发来的
 * 读/写请求都先经此解析成当前 projectKey，从而透明访问到同一项目的内容，
 * 无需客户端或 SDK 感知改名。所有按 project key 定位项目的路径共用它，
 * 别名支持因此只在一处实现。
 */
@Injectable()
export class ProjectResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** 先查项目本身，未命中再查别名；都未命中返回 null。 */
  async resolveCanonicalKey(inputKey: string): Promise<string | null> {
    const key = normalizeProjectKey(inputKey)

    const project = await this.prisma.project.findUnique({
      where: { projectKey: key },
      select: { projectKey: true },
    })
    if (project) {
      return project.projectKey
    }

    const alias = await this.prisma.projectAlias.findUnique({
      where: { alias: key },
      select: { projectKey: true },
    })
    return alias ? alias.projectKey : null
  }

  /** 解析失败即抛 404，用于替换各服务原有的 ensureProjectExists。 */
  async resolveCanonicalKeyOrThrow(inputKey: string): Promise<string> {
    const key = await this.resolveCanonicalKey(inputKey)
    if (!key) {
      throw new NotFoundException("Project not found")
    }
    return key
  }
}

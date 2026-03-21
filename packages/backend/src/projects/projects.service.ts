import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { CreateProjectDto } from "./dto/create-project.dto"
import { QueryProjectsDto } from "./dto/query-projects.dto"
import { UpdateProjectDto } from "./dto/update-project.dto"

type ProjectItem = {
  id: string
  project_key: string
  name: string
  repo_url: string | null
  description: string | null
  created_at: number
  updated_at: number
}

type ProjectListResponse = {
  total: number
  data: ProjectItem[]
}

type GithubRepoPreview = {
  project_key: string
  name: string
  repo_url: string
  description: string | null
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function normalizeProjectKey(projectKey: string): string {
  return projectKey.trim().toLowerCase()
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(): Promise<{ count: number }> {
    const count = await this.prisma.project.count()
    return { count }
  }

  async findAll(query: QueryProjectsDto): Promise<ProjectListResponse> {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.project.count(),
      this.prisma.project.findMany({
        take: query.limit,
        skip: query.offset,
        orderBy: {
          createdAt: "desc",
        },
      }),
    ])

    return {
      total,
      data: data.map((project) => this.toProjectItem(project)),
    }
  }

  async findOne(id: string): Promise<ProjectItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(id) },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.toProjectItem(project)
  }

  async findOneByProjectKey(projectKey: string): Promise<ProjectItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(projectKey) },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.toProjectItem(project)
  }

  async create(dto: CreateProjectDto): Promise<ProjectItem> {
    try {
      const project = await this.prisma.project.create({
        data: {
          projectKey: normalizeProjectKey(dto.project_key),
          name: dto.name,
          repoUrl: dto.repo_url,
          description: dto.description,
        },
      })

      return this.toProjectItem(project)
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("project_key already exists")
      }

      throw error
    }
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(id) },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    try {
      const updated = await this.prisma.project.update({
        where: { projectKey: project.projectKey },
        data: {
          projectKey:
            dto.project_key === undefined ? undefined : normalizeProjectKey(dto.project_key),
          name: dto.name,
          repoUrl: dto.repo_url,
          description: dto.description,
          updatedAt: nowSeconds(),
        },
      })

      return this.toProjectItem(updated)
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("project_key already exists")
      }

      throw error
    }
  }

  async remove(id: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(id) },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    await this.prisma.project.delete({ where: { projectKey: project.projectKey } })
  }

  async previewFromGithubRepo(repoUrl: string): Promise<GithubRepoPreview> {
    const { owner, repo } = this.parseGithubRepository(repoUrl)
    const endpoint = `https://api.github.com/repos/${owner}/${repo}`

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Verhub/1.2",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException("GitHub repository not found")
      }

      throw new BadGatewayException(`GitHub API request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      name?: string
      full_name?: string
      description?: string | null
      html_url?: string
    }

    const resolvedRepo = payload.name?.trim() || repo
    const displayName = payload.full_name?.trim() || `${owner}/${resolvedRepo}`
    const finalRepoUrl = payload.html_url?.trim() || `https://github.com/${owner}/${resolvedRepo}`

    return {
      project_key: normalizeProjectKey(`${owner}-${resolvedRepo}`),
      name: displayName,
      repo_url: finalRepoUrl,
      description: payload.description?.trim() || null,
    }
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "projects",
      implemented: true,
    }
  }

  private toProjectItem(project: {
    projectKey: string
    name: string
    repoUrl: string | null
    description: string | null
    createdAt: number
    updatedAt: number
  }): ProjectItem {
    return {
      id: project.projectKey,
      project_key: project.projectKey,
      name: project.name,
      repo_url: project.repoUrl,
      description: project.description,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false
    }

    return "code" in error && error.code === "P2002"
  }

  private parseGithubRepository(repoUrl: string): { owner: string; repo: string } {
    let parsed: URL
    try {
      parsed = new URL(repoUrl)
    } catch {
      throw new BadRequestException("repo_url is not a valid URL")
    }

    if (parsed.hostname !== "github.com") {
      throw new BadRequestException("Only github.com repository URL is supported")
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (segments.length < 2) {
      throw new BadRequestException("repo_url must contain owner and repository")
    }

    const owner = segments[0]
    const rawRepo = segments[1]
    if (!owner || !rawRepo) {
      throw new BadRequestException("repo_url must contain owner and repository")
    }

    const repo = rawRepo.replace(/\.git$/i, "")
    if (!repo) {
      throw new BadRequestException("repo_url must contain owner and repository")
    }

    return { owner, repo }
  }
}

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"

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
  created_at: string
  updated_at: string
}

type ProjectListResponse = {
  total: number
  data: ProjectItem[]
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
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.toProjectItem(project)
  }

  async findOneByProjectKey(projectKey: string): Promise<ProjectItem> {
    const project = await this.prisma.project.findUnique({ where: { projectKey } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.toProjectItem(project)
  }

  async create(dto: CreateProjectDto): Promise<ProjectItem> {
    try {
      const project = await this.prisma.project.create({
        data: {
          projectKey: dto.project_key,
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
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    try {
      const updated = await this.prisma.project.update({
        where: { id },
        data: {
          projectKey: dto.project_key,
          name: dto.name,
          repoUrl: dto.repo_url,
          description: dto.description,
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
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    await this.prisma.project.delete({ where: { id } })
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "projects",
      implemented: true,
    }
  }

  private toProjectItem(project: {
    id: string
    projectKey: string
    name: string
    repoUrl: string | null
    description: string | null
    createdAt: Date
    updatedAt: Date
  }): ProjectItem {
    return {
      id: project.id,
      project_key: project.projectKey,
      name: project.name,
      repo_url: project.repoUrl,
      description: project.description,
      created_at: project.createdAt.toISOString(),
      updated_at: project.updatedAt.toISOString(),
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false
    }

    return "code" in error && error.code === "P2002"
  }
}

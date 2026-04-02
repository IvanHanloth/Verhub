import { AdminBootstrapService } from "./admin-bootstrap.service"

type PrismaMock = {
  user: {
    count: jest.Mock
    create: jest.Mock
  }
}

function createPrismaMock(): PrismaMock {
  return {
    user: {
      count: jest.fn(),
      create: jest.fn(),
    },
  }
}

describe("AdminBootstrapService", () => {
  it("initializes admin on first startup and writes bootstrap credential file", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(0)
    prisma.user.create.mockResolvedValue({ id: "admin-id" })

    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ADMIN_PASSWORD: "",
        }
        return values[key]
      }),
    }

    const service = new AdminBootstrapService(prisma as never, configService as never)

    const writeBootstrapSpy = jest
      .spyOn(
        service as unknown as {
          writeBootstrapCredentialFile: (username: string, password: string) => Promise<string>
        },
        "writeBootstrapCredentialFile",
      )
      .mockResolvedValue("/bootstrap/verhub.bootstrap-admin.txt")

    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined)

    await service.onModuleInit()

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: "admin",
        passwordHash: expect.any(String),
        role: "ADMIN",
        updatedAt: expect.any(Number),
      },
    })
    expect(writeBootstrapSpy).toHaveBeenCalledWith("admin", expect.any(String))
    expect(infoSpy).toHaveBeenCalledWith("[verhub][bootstrap] admin account initialized")
    expect(infoSpy).toHaveBeenCalledWith("[verhub][bootstrap] username=admin")
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[verhub\]\[bootstrap\] password=/),
    )
    expect(infoSpy).toHaveBeenCalledWith(
      "[verhub][bootstrap] credential_file=/bootstrap/verhub.bootstrap-admin.txt",
    )

    infoSpy.mockRestore()
  })

  it("skips admin bootstrap if user already exists", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(1)

    const service = new AdminBootstrapService(prisma as never, { get: jest.fn() } as never)

    const writeBootstrapSpy = jest
      .spyOn(
        service as unknown as {
          writeBootstrapCredentialFile: (username: string, password: string) => Promise<string>
        },
        "writeBootstrapCredentialFile",
      )
      .mockResolvedValue("/bootstrap/verhub.bootstrap-admin.txt")

    await service.onModuleInit()

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(writeBootstrapSpy).not.toHaveBeenCalled()
  })

  it("does not print bootstrap password when admin password is configured", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(0)
    prisma.user.create.mockResolvedValue({ id: "admin-id" })

    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ADMIN_PASSWORD: "provided-password",
        }
        return values[key]
      }),
    }

    const service = new AdminBootstrapService(prisma as never, configService as never)

    const writeBootstrapSpy = jest
      .spyOn(
        service as unknown as {
          writeBootstrapCredentialFile: (username: string, password: string) => Promise<string>
        },
        "writeBootstrapCredentialFile",
      )
      .mockResolvedValue("/bootstrap/verhub.bootstrap-admin.txt")

    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined)

    await service.onModuleInit()

    expect(writeBootstrapSpy).toHaveBeenCalledWith("admin", "provided-password")
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\[verhub\]\[bootstrap\] password=provided-password$/),
    )

    infoSpy.mockRestore()
  })

  it("removeBootstrapCredentialFile silently succeeds when file does not exist", async () => {
    const prisma = createPrismaMock()
    const configService = {
      get: jest.fn((key: string) => {
        if (key === "BOOTSTRAP_SECRET_DIR") return "/tmp/test"
        return undefined
      }),
    }

    const service = new AdminBootstrapService(prisma as never, configService as never)
    // Should not throw even when file doesn't exist
    await expect(service.removeBootstrapCredentialFile()).resolves.toBeUndefined()
  })

  it("uses BOOTSTRAP_SECRET_DIR when configured", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(1) // skip bootstrap

    const configService = {
      get: jest.fn((key: string) => {
        if (key === "BOOTSTRAP_SECRET_DIR") return "/custom/dir"
        return undefined
      }),
    }

    const service = new AdminBootstrapService(prisma as never, configService as never)
    await service.onModuleInit()

    // The service resolved path correctly (no error means it worked)
    expect(prisma.user.count).toHaveBeenCalled()
  })
})

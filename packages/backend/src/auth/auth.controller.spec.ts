import { BadRequestException } from "@nestjs/common"

import { AuthController } from "./auth.controller"

describe("AuthController", () => {
  const mockAuthService = {
    login: jest.fn(),
    getAdminProfile: jest.fn(),
    updateAdminProfile: jest.fn(),
    getStatus: jest.fn(),
  }
  const mockApiKeyService = {
    listApiKeys: jest.fn(),
    getApiScopes: jest.fn(),
    createApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
    updateApiKey: jest.fn(),
    rotateApiKey: jest.fn(),
  }

  let controller: AuthController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AuthController(mockAuthService as never, mockApiKeyService as never)
  })

  // ── Login ──

  it("delegates login to auth service", async () => {
    const dto = { username: "admin", password: "pass123" }
    const expected = { access_token: "jwt", expires_in: 7200, user: {} }
    mockAuthService.login.mockResolvedValue(expected)

    const result = await controller.login(dto as never)
    expect(result).toBe(expected)
    expect(mockAuthService.login).toHaveBeenCalledWith(dto)
  })

  // ── Profile ──

  it("delegates getAdminProfile to auth service", async () => {
    const profile = { id: "1", username: "admin", role: "ADMIN" }
    mockAuthService.getAdminProfile.mockResolvedValue(profile)
    expect(await controller.getAdminProfile()).toBe(profile)
  })

  it("delegates getMe to auth service", async () => {
    const profile = { id: "1", username: "admin" }
    mockAuthService.getAdminProfile.mockResolvedValue(profile)
    expect(await controller.getMe()).toBe(profile)
  })

  it("delegates updateAdminProfile", async () => {
    const dto = { current_password: "old", username: "new-admin" }
    mockAuthService.updateAdminProfile.mockResolvedValue({ id: "1", username: "new-admin" })
    await controller.updateAdminProfile(dto as never)
    expect(mockAuthService.updateAdminProfile).toHaveBeenCalledWith(dto)
  })

  // ── Password / Account ──

  it("changePassword delegates to updateAdminProfile and returns success", async () => {
    mockAuthService.updateAdminProfile.mockResolvedValue({})
    const result = await controller.changePassword({
      current_password: "old",
      new_password: "new",
    } as never)
    expect(result).toEqual({ success: true })
    expect(mockAuthService.updateAdminProfile).toHaveBeenCalledWith({
      current_password: "old",
      new_password: "new",
    })
  })

  it("updateAccount delegates to updateAdminProfile and returns success", async () => {
    mockAuthService.updateAdminProfile.mockResolvedValue({})
    const result = await controller.updateAccount({
      current_password: "pass",
      username: "new-name",
    } as never)
    expect(result).toEqual({ success: true })
    expect(mockAuthService.updateAdminProfile).toHaveBeenCalledWith({
      current_password: "pass",
      username: "new-name",
    })
  })

  // ── API keys ──

  it("listApiKeys delegates to api key service", async () => {
    const keys = { data: [] }
    mockApiKeyService.listApiKeys.mockResolvedValue(keys)
    expect(await controller.listApiKeys()).toBe(keys)
  })

  it("listApiScopes delegates to api key service", async () => {
    const scopes = { data: ["read"], default: ["read"] }
    mockApiKeyService.getApiScopes.mockReturnValue(scopes)
    expect(await controller.listApiScopes()).toBe(scopes)
  })

  it("listTokens returns data array from api key service", async () => {
    const data = [{ id: "1", name: "key" }]
    mockApiKeyService.listApiKeys.mockResolvedValue({ data })
    expect(await controller.listTokens()).toBe(data)
  })

  it("createApiKey throws if actor identity missing", async () => {
    const req = { user: {} }
    await expect(controller.createApiKey(req, { name: "test" } as never)).rejects.toThrow(
      BadRequestException,
    )
  })

  it("createApiKey delegates with actorId", async () => {
    const req = { user: { sub: "admin-1" } }
    const dto = { name: "test-key" }
    const created = { id: "key-1", token: "vh_abc" }
    mockApiKeyService.createApiKey.mockResolvedValue(created)

    const result = await controller.createApiKey(req, dto as never)
    expect(result).toBe(created)
    expect(mockApiKeyService.createApiKey).toHaveBeenCalledWith(dto, "admin-1")
  })

  it("createToken throws if actor identity missing", async () => {
    await expect(controller.createToken({ user: {} }, { name: "test" } as never)).rejects.toThrow(
      BadRequestException,
    )
  })

  it("createToken delegates with actorId", async () => {
    const req = { user: { sub: "admin-1" } }
    mockApiKeyService.createApiKey.mockResolvedValue({ id: "1" })
    await controller.createToken(req, { name: "key" } as never)
    expect(mockApiKeyService.createApiKey).toHaveBeenCalledWith({ name: "key" }, "admin-1")
  })

  it("revokeApiKey delegates and returns success", async () => {
    mockApiKeyService.revokeApiKey.mockResolvedValue(undefined)
    expect(await controller.revokeApiKey("key-1")).toEqual({ success: true })
    expect(mockApiKeyService.revokeApiKey).toHaveBeenCalledWith("key-1")
  })

  it("revokeToken delegates and returns success", async () => {
    mockApiKeyService.revokeApiKey.mockResolvedValue(undefined)
    expect(await controller.revokeToken("key-2")).toEqual({ success: true })
  })

  it("updateApiKey delegates to api key service", async () => {
    const dto = { name: "updated" }
    mockApiKeyService.updateApiKey.mockResolvedValue({ id: "1", name: "updated" })
    await controller.updateApiKey("key-1", dto as never)
    expect(mockApiKeyService.updateApiKey).toHaveBeenCalledWith("key-1", dto)
  })

  it("updateToken delegates to api key service", async () => {
    const dto = { name: "updated" }
    mockApiKeyService.updateApiKey.mockResolvedValue({ id: "1" })
    await controller.updateToken("key-2", dto as never)
    expect(mockApiKeyService.updateApiKey).toHaveBeenCalledWith("key-2", dto)
  })

  it("rotateApiKey delegates to api key service", async () => {
    const dto = { grace_period_minutes: 30 }
    const result = { id: "1", token: "vh_new" }
    mockApiKeyService.rotateApiKey.mockResolvedValue(result)
    expect(await controller.rotateApiKey("key-1", dto as never)).toBe(result)
  })

  it("rotateToken delegates to api key service", async () => {
    mockApiKeyService.rotateApiKey.mockResolvedValue({ id: "1" })
    await controller.rotateToken("key-1", {} as never)
    expect(mockApiKeyService.rotateApiKey).toHaveBeenCalledWith("key-1", {})
  })

  // ── Status ──

  it("returns module status", () => {
    mockAuthService.getStatus.mockReturnValue({ module: "auth", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "auth", implemented: true })
  })
})

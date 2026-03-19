import { SetMetadata } from "@nestjs/common"

export const API_SCOPE_KEY = "api_scope"

export function RequireApiScope(scope: string) {
  return SetMetadata(API_SCOPE_KEY, scope)
}

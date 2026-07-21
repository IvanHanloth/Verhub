import { Transform } from "class-transformer"
import { IsString, MaxLength, MinLength } from "class-validator"

export class SetGithubWebhookSecretDto {
  /**
   * The exact string configured on GitHub's webhook form.
   *
   * Trimmed before length checks so an all-whitespace value cannot pass as a
   * 16-character secret and leave the endpoint enabled with nothing behind it.
   * The floor is a brute-force guard, not a GitHub requirement: this secret is
   * the only credential protecting the delivery endpoint.
   */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  secret!: string
}

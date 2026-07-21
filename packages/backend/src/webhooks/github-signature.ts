/**
 * HMAC verification for GitHub webhook deliveries.
 *
 * Pure functions with no DI dependency so the signature rules can be unit
 * tested without standing up a Nest module.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

/** Header GitHub puts the HMAC-SHA256 signature in. */
export const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256"

/** Header carrying the event name (`release`, `ping`, …). */
export const GITHUB_EVENT_HEADER = "x-github-event"

/** Header carrying the unique delivery id, used for log correlation. */
export const GITHUB_DELIVERY_HEADER = "x-github-delivery"

/** Compute the `sha256=<hex>` signature GitHub sends for a raw request body. */
export function computeGithubSignature(secret: string, rawBody: Buffer | string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`
}

/**
 * Constant-time comparison of the delivered signature against the expected one.
 *
 * Length is compared first because `timingSafeEqual` throws on mismatched
 * buffers; a wrong length already tells an attacker nothing they could not
 * observe from the header they sent.
 */
export function verifyGithubSignature(
  secret: string,
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) {
    return false
  }

  const expected = Buffer.from(computeGithubSignature(secret, rawBody))
  const received = Buffer.from(signatureHeader)
  if (expected.length !== received.length) {
    return false
  }

  return timingSafeEqual(expected, received)
}

import { BUILTIN_TERMS_DOCUMENTS } from "./terms-documents"
import { TERMS_PLACEHOLDERS, resolvePlaceholders } from "./placeholders"

describe("terms placeholders", () => {
  it("lists placeholders in the order they appear, without repeats", () => {
    const resolved = resolvePlaceholders(
      "{{operator_name}} / {{contact_email}} / {{operator_name}}",
    )

    expect(resolved.map((item) => item.key)).toEqual(["operator_name", "contact_email"])
  })

  it("refuses an unregistered key so no unfillable slot reaches the public page", () => {
    expect(() => resolvePlaceholders("{{who_knows}}")).toThrow(/who_knows/)
  })

  it("registers every placeholder used by the builtin documents", () => {
    for (const document of Object.values(BUILTIN_TERMS_DOCUMENTS)) {
      for (const placeholder of document.placeholders) {
        expect(TERMS_PLACEHOLDERS[placeholder.key]).toBeDefined()
      }
    }
  })

  it("asks the SDK compliance document for the operator and a contact", () => {
    const keys = BUILTIN_TERMS_DOCUMENTS["sdk-compliance"].placeholders.map((item) => item.key)

    expect(keys).toEqual(
      expect.arrayContaining(["effective_date", "operator_name", "contact_email"]),
    )
  })

  it("keeps the privacy policy fillable: operator, contact and retention are asked for", () => {
    const keys = BUILTIN_TERMS_DOCUMENTS["privacy-policy"].placeholders.map((item) => item.key)

    expect(keys).toEqual(
      expect.arrayContaining([
        "effective_date",
        "operator_name",
        "operator_address",
        "contact_email",
        "hosting_provider",
        "storage_region",
        "geo_providers",
        "detail_retention",
        "response_days",
      ]),
    )
  })
})

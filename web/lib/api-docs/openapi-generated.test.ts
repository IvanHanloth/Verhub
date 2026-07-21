import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "yaml"
import { describe, expect, it } from "vitest"

import { openApiDocument } from "./openapi.generated"

// vitest 以 web/ 为工作目录运行，契约文件在仓库根目录。
const yamlPath = resolve(process.cwd(), "..", "verhub.openapi.yaml")

describe("openapi.generated.ts", () => {
  it("stays in sync with verhub.openapi.yaml", () => {
    const source = parse(readFileSync(yamlPath, "utf8"))

    // 生成物过期时这条断言先红，提示执行 `pnpm api:sync`。
    expect(openApiDocument).toEqual(source)
  })
})

import { Prisma } from "@prisma/client"

import { andAll, compileFilters } from "./compile"
import type { EventFilterDto } from "../dto/event-filter.dto"

function filter(partial: Partial<EventFilterDto>): EventFilterDto {
  return { property: "plan", op: "eq", ...partial } as EventFilterDto
}

/** 展开成 (SQL 文本, 参数数组)，用于断言「值从来不出现在 SQL 文本里」。 */
function inspect(sql: Prisma.Sql): { text: string; values: unknown[] } {
  return { text: sql.sql, values: sql.values }
}

describe("compileFilters", () => {
  it("returns nothing for an empty filter list", () => {
    expect(compileFilters(undefined)).toEqual([])
    expect(compileFilters([])).toEqual([])
  })

  it("never puts the property name or the value into the SQL text", () => {
    // 这是整个 DSL 唯一需要防注入的地方，也是本文件最重要的断言。
    const hostile = '\'; DROP TABLE "EventRecord"; --'
    const { text, values } = inspect(
      andAll(compileFilters([filter({ property: hostile, value: hostile })])),
    )

    expect(text).not.toContain("DROP TABLE")
    expect(text).not.toContain(hostile)
    expect(values).toContain(hostile)
  })

  it("parameterizes every operator, including the multi-value ones", () => {
    const ops: Array<[EventFilterDto["op"], unknown]> = [
      ["eq", "pro"],
      ["neq", "pro"],
      ["contains", "pro"],
      ["gt", 10],
      ["gte", 10],
      ["lt", 10],
      ["lte", 10],
      ["in", ["pro", "team"]],
      ["not_in", ["pro", "team"]],
    ]

    for (const [op, value] of ops) {
      const compiled = andAll(compileFilters([filter({ op, value } as never)]))
      const { text, values } = inspect(compiled)
      expect(text).not.toMatch(/'pro'|'team'/)
      // Prisma.Sql 的占位符是 ?，实际值全部在 values 里。
      expect(text).toContain("?")
      expect(values.length).toBeGreaterThan(0)
    }
  })

  it("compares as text so a key reported as both number and string still matches", () => {
    const { text } = inspect(andAll(compileFilters([filter({ op: "eq", value: "1" })])))
    expect(text).toContain('"properties" ->>')
  })

  it("treats a missing property as not-equal rather than excluding the row", () => {
    const { text } = inspect(andAll(compileFilters([filter({ op: "neq", value: "pro" })])))
    expect(text).toContain("IS DISTINCT FROM")
  })

  it("guards numeric comparison so one dirty row cannot fail the whole query", () => {
    const { text } = inspect(andAll(compileFilters([filter({ op: "gt", value: 10 })])))
    expect(text).toContain("~")
    expect(text).toContain("::numeric")
  })

  it("makes a numeric comparison against a non-numeric value a constant false", () => {
    // 看板里一张卡片配错了不该让整个页面挂掉。
    const { text } = inspect(andAll(compileFilters([filter({ op: "gt", value: "abc" })])))
    expect(text).toContain("FALSE")
  })

  it("escapes ILIKE wildcards so searching for 50% does not match everything", () => {
    const { values } = inspect(andAll(compileFilters([filter({ op: "contains", value: "50%" })])))
    expect(values).toContain("%50\\%%")
  })

  it("needs no value for exists / not_exists", () => {
    expect(inspect(andAll(compileFilters([filter({ op: "exists" })]))).text).toContain(
      "IS NOT NULL",
    )
    expect(inspect(andAll(compileFilters([filter({ op: "not_exists" })]))).text).toContain(
      "IS NULL",
    )
  })

  it("accepts a comma-separated string for in / not_in", () => {
    const { values } = inspect(andAll(compileFilters([filter({ op: "in", value: "pro,team" })])))
    expect(values).toContainEqual(["pro", "team"])
  })

  it("caps the number of values so one filter cannot carry an unbounded list", () => {
    const many = Array.from({ length: 500 }, (_, index) => `v${index}`)
    const { values } = inspect(andAll(compileFilters([filter({ op: "in", value: many })])))
    expect((values.find(Array.isArray) as string[]).length).toBe(50)
  })

  it("truncates an oversized single value", () => {
    const { values } = inspect(
      andAll(compileFilters([filter({ op: "eq", value: "x".repeat(2000) })])),
    )
    expect(values).toContain("x".repeat(512))
  })

  it("qualifies the column with the table alias when one is given", () => {
    // 带 JOIN 的子查询里，裸的 "properties" 会解析到外层的表上。
    const { text } = inspect(andAll(compileFilters([filter({})], "e")))
    expect(text).toContain('e."properties"')
  })

  it("refuses an alias that is not a plain identifier", () => {
    // 别名永远来自本模块内的字面量，这条断言让「不来自用户输入」在代码里可验证。
    expect(() => compileFilters([filter({})], 'e"; DROP TABLE x; --')).toThrow(/Invalid SQL alias/)
    expect(() => compileFilters([filter({})], "1e")).toThrow(/Invalid SQL alias/)
  })
})

describe("andAll", () => {
  it("returns a tautology for no conditions so callers need no branch", () => {
    expect(inspect(andAll([])).text).toBe("TRUE")
  })

  it("joins conditions with AND", () => {
    const { text } = inspect(
      andAll(
        compileFilters([
          filter({ op: "exists" }),
          filter({ property: "amount", op: "gt", value: 1 }),
        ]),
      ),
    )
    expect(text).toContain("AND")
  })
})

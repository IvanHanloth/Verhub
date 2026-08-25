import { FormulaError, evaluateFormula, validateFormula } from "./formula"

describe("evaluateFormula", () => {
  const values = { A: 10, B: 4, C: 0 }

  it("evaluates the arithmetic a conversion-rate card actually needs", () => {
    expect(evaluateFormula("A / B * 100", values)).toBe(250)
    expect(evaluateFormula("A + B", values)).toBe(14)
    expect(evaluateFormula("A - B", values)).toBe(6)
    expect(evaluateFormula("A * B", values)).toBe(40)
  })

  it("respects precedence and parentheses", () => {
    expect(evaluateFormula("A + B * 2", values)).toBe(18)
    expect(evaluateFormula("(A + B) * 2", values)).toBe(28)
    expect(evaluateFormula("A / (B - 2)", values)).toBe(5)
  })

  it("handles unary minus and decimals", () => {
    expect(evaluateFormula("-A", values)).toBe(-10)
    expect(evaluateFormula("A * 0.5", values)).toBe(5)
    expect(evaluateFormula("-(A - B)", values)).toBe(-6)
  })

  it("returns 0 on division by zero instead of throwing or yielding Infinity", () => {
    // 转化率类公式的分母天然会在没有数据的时间桶上为零，画成 0 是唯一说得通的展示；
    // 抛错会让整条曲线消失。
    expect(evaluateFormula("A / C", values)).toBe(0)
    expect(evaluateFormula("A / 0", values)).toBe(0)
  })

  it("rejects anything outside the grammar rather than evaluating it", () => {
    // 这一组是核心的安全断言：没有任何输入能让求值器执行代码。
    expect(() => evaluateFormula("process.exit(1)", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("require('fs')", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("globalThis", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("A; B", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("A ** B", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("A % B", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("`${A}`", values)).toThrow(FormulaError)
  })

  it("rejects undefined aliases", () => {
    expect(() => evaluateFormula("A / Z", values)).toThrow(/未定义的别名/)
  })

  it("rejects malformed expressions", () => {
    expect(() => evaluateFormula("", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("A +", values)).toThrow(FormulaError)
    expect(() => evaluateFormula("(A + B", values)).toThrow(/括号不匹配/)
    expect(() => evaluateFormula("A) + B", values)).toThrow(/多余内容/)
    expect(() => evaluateFormula("A B", values)).toThrow(/多余内容/)
  })

  it("rejects an oversized formula before parsing it", () => {
    expect(() => evaluateFormula("A+".repeat(200) + "A", values)).toThrow(/过长/)
  })
})

describe("validateFormula", () => {
  it("accepts a formula whose aliases are all declared", () => {
    expect(() => validateFormula("A / B * 100", ["A", "B"])).not.toThrow()
  })

  it("rejects a formula referencing an alias the card does not define", () => {
    // 存进去就报错，好过每次打开看板炸一遍且没人知道是哪张卡片。
    expect(() => validateFormula("A / B", ["A"])).toThrow(FormulaError)
  })

  it("does not treat a zero-valued alias as undefined", () => {
    // 校验用 1 填充，避免把「分母可能为 0」误判成语法问题。
    expect(() => validateFormula("A / B", ["A", "B"])).not.toThrow()
  })
})

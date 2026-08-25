/**
 * 指标公式求值。
 *
 * 看板卡片允许写 "A / B * 100" 这样的跨事件运算。**绝不用 eval / Function**：
 * 那等于把任意代码执行权交给任何能编辑看板的人，而看板是管理端里权限最低的
 * 一块。这里是一个只认「别名、数字、+ - * / ( )」的递归下降解析器，语法之外
 * 的任何输入都在解析期被拒绝，公式也从不下推到 SQL。
 */

/** 公式长度上限。真实指标不会超过这个长度，超长的只会是构造出来的深层嵌套。 */
export const MAX_FORMULA_LENGTH = 256

/** 别名：单个大写字母，与 DSL 里 events[].alias 的取值一致。 */
const ALIAS_PATTERN = /^[A-Z]$/

type Token =
  | { kind: "number"; value: number }
  | { kind: "alias"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" }

export class FormulaError extends Error {}

/**
 * 求值。`values` 是各别名在当前桶上的度量值。
 *
 * 除零返回 0 而不是抛错或者 Infinity：转化率类公式的分母天然会在没有数据的
 * 时间桶上为零，画成 0 是唯一说得通的展示，抛错会让整条曲线消失。
 */
export function evaluateFormula(formula: string, values: Record<string, number>): number {
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError("公式过长")
  }

  const tokens = tokenize(formula)
  const parser = new Parser(tokens, values)
  const result = parser.parseExpression()
  parser.expectEnd()
  return Number.isFinite(result) ? result : 0
}

/** 只做语法与别名校验，不求值。保存看板卡片时用，避免存进去一条永远算不出的公式。 */
export function validateFormula(formula: string, aliases: string[]): void {
  const values: Record<string, number> = {}
  for (const alias of aliases) {
    values[alias] = 1
  }
  evaluateFormula(formula, values)
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < formula.length) {
    const char = formula.charAt(index)

    if (char === " " || char === "\t") {
      index += 1
      continue
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "op", value: char })
      index += 1
      continue
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char })
      index += 1
      continue
    }

    if (char >= "0" && char <= "9") {
      let end = index
      while (end < formula.length && /[0-9.]/.test(formula.charAt(end))) {
        end += 1
      }
      const raw = formula.slice(index, end)
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        throw new FormulaError(`无法解析的数字：${raw}`)
      }
      tokens.push({ kind: "number", value })
      index = end
      continue
    }

    if (ALIAS_PATTERN.test(char)) {
      tokens.push({ kind: "alias", value: char })
      index += 1
      continue
    }

    throw new FormulaError(`公式中出现不允许的字符：${char}`)
  }

  if (!tokens.length) {
    throw new FormulaError("公式为空")
  }

  return tokens
}

class Parser {
  private position = 0

  constructor(
    private readonly tokens: Token[],
    private readonly values: Record<string, number>,
  ) {}

  /** expression := term (("+" | "-") term)* */
  parseExpression(): number {
    let left = this.parseTerm()

    for (;;) {
      const token = this.peek()
      if (token?.kind !== "op" || (token.value !== "+" && token.value !== "-")) {
        return left
      }
      this.position += 1
      const right = this.parseTerm()
      left = token.value === "+" ? left + right : left - right
    }
  }

  /** term := factor (("*" | "/") factor)* */
  private parseTerm(): number {
    let left = this.parseFactor()

    for (;;) {
      const token = this.peek()
      if (token?.kind !== "op" || (token.value !== "*" && token.value !== "/")) {
        return left
      }
      this.position += 1
      const right = this.parseFactor()
      if (token.value === "*") {
        left *= right
      } else {
        left = right === 0 ? 0 : left / right
      }
    }
  }

  /** factor := "-" factor | "(" expression ")" | number | alias */
  private parseFactor(): number {
    const token = this.peek()
    if (!token) {
      throw new FormulaError("公式在预期有操作数的位置结束")
    }

    if (token.kind === "op" && token.value === "-") {
      this.position += 1
      return -this.parseFactor()
    }

    if (token.kind === "paren" && token.value === "(") {
      this.position += 1
      const value = this.parseExpression()
      const closing = this.peek()
      if (closing?.kind !== "paren" || closing.value !== ")") {
        throw new FormulaError("括号不匹配")
      }
      this.position += 1
      return value
    }

    if (token.kind === "number") {
      this.position += 1
      return token.value
    }

    if (token.kind === "alias") {
      this.position += 1
      const value = this.values[token.value]
      if (value === undefined) {
        throw new FormulaError(`公式引用了未定义的别名：${token.value}`)
      }
      return value
    }

    throw new FormulaError("公式语法错误")
  }

  expectEnd(): void {
    if (this.position !== this.tokens.length) {
      throw new FormulaError("公式末尾有多余内容")
    }
  }

  private peek(): Token | undefined {
    return this.tokens[this.position]
  }
}

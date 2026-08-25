import { Prisma } from "@prisma/client"

import {
  MAX_FILTER_VALUES,
  MAX_FILTER_VALUE_LENGTH,
  type EventFilterDto,
  type EventFilterOp,
} from "../dto/event-filter.dto"

/**
 * 把属性筛选编译成参数化的 SQL 片段。
 *
 * 这里是整个 DSL 唯一接触 SQL 的地方，也是唯一需要防注入的地方。规则只有一条：
 * **属性名与比较值一律以参数进入，绝不拼进 SQL 文本。** 算子是闭集，每个算子
 * 在下面有一条固定形状的分支；新增算子必须照此办理。
 *
 * 比较一律按文本：properties 是 JSONB，同一个键在不同上报里可能是数字也可能是
 * 字符串（客户端换了个写法就会这样），`->>` 取出文本再比才不会漏掉一半数据。
 * 数值比较（gt/lt）在取出后显式转 numeric，转不动的行自然落选。
 *
 * `alias` 是 properties 所属表的别名。带 JOIN 的子查询里必须显式限定，否则
 * 裸的 "properties" 会解析到外层的表上。只接受受控的短标识符，不是用户输入。
 */
export function compileFilters(
  filters: EventFilterDto[] | undefined,
  alias?: string,
): Prisma.Sql[] {
  if (!filters?.length) {
    return []
  }
  const column = propertiesColumn(alias)
  return filters.map((filter) => compileFilter(filter, column))
}

/**
 * properties 列的引用。alias 只允许字母，调用方全是本模块内的字面量；
 * 校验在这里是为了让「别名永远不来自用户输入」这件事在代码里可验证。
 */
function propertiesColumn(alias: string | undefined): Prisma.Sql {
  if (!alias) {
    return Prisma.sql`"properties"`
  }
  if (!/^[a-z][a-z0-9_]{0,15}$/i.test(alias)) {
    throw new Error(`Invalid SQL alias: ${alias}`)
  }
  return Prisma.raw(`${alias}."properties"`)
}

function compileFilter(filter: EventFilterDto, properties: Prisma.Sql): Prisma.Sql {
  const key = filter.property
  const text = Prisma.sql`(${properties} ->> ${key})`

  switch (filter.op) {
    case "exists":
      return Prisma.sql`(${text} IS NOT NULL)`
    case "not_exists":
      return Prisma.sql`(${text} IS NULL)`
    case "eq":
      return Prisma.sql`(${text} = ${single(filter)})`
    // NULL 也算「不等于」：某些行根本没有这个属性，把它们排除掉不符合直觉。
    case "neq":
      return Prisma.sql`(${text} IS DISTINCT FROM ${single(filter)})`
    case "contains":
      return Prisma.sql`(${text} ILIKE ${`%${escapeLike(single(filter))}%`} ESCAPE '\\')`
    case "in":
      return Prisma.sql`(${text} = ANY(${many(filter)}))`
    case "not_in":
      return Prisma.sql`(${text} IS NULL OR NOT (${text} = ANY(${many(filter)})))`
    case "gt":
      return numeric(text, Prisma.sql`>`, filter)
    case "gte":
      return numeric(text, Prisma.sql`>=`, filter)
    case "lt":
      return numeric(text, Prisma.sql`<`, filter)
    case "lte":
      return numeric(text, Prisma.sql`<=`, filter)
    default:
      return assertNever(filter.op)
  }
}

/**
 * 数值比较。左边用正则挡掉非数字文本再转 numeric——不挡的话一行脏数据就会让
 * 整个查询以 invalid input syntax 失败，而不是安静地落选。
 */
function numeric(text: Prisma.Sql, operator: Prisma.Sql, filter: EventFilterDto): Prisma.Sql {
  const value = Number(single(filter))
  if (!Number.isFinite(value)) {
    // 比较值本身不是数字，条件恒假。返回 FALSE 而不是报错：批量看板里
    // 一张卡片配错了不该让整个页面挂掉。
    return Prisma.sql`FALSE`
  }
  return Prisma.sql`(${text} ~ '^-?[0-9]+(\.[0-9]+)?$' AND (${text})::numeric ${operator} ${value})`
}

function single(filter: EventFilterDto): string {
  const raw = Array.isArray(filter.value) ? filter.value[0] : filter.value
  return normalizeValue(raw)
}

function many(filter: EventFilterDto): string[] {
  const raw = filter.value
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : raw === undefined
        ? []
        : [raw]
  return list.slice(0, MAX_FILTER_VALUES).map((item) => normalizeValue(item))
}

function normalizeValue(raw: unknown): string {
  if (raw === undefined || raw === null) {
    return ""
  }
  return String(raw).slice(0, MAX_FILTER_VALUE_LENGTH)
}

/** ILIKE 的通配符要转义，否则用户搜 "50%" 会匹配到一切。 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function assertNever(op: never): never {
  throw new Error(`Unsupported event filter op: ${String(op as EventFilterOp)}`)
}

/** 把若干条件用 AND 串起来；空数组返回恒真，调用方不必分支。 */
export function andAll(conditions: Prisma.Sql[]): Prisma.Sql {
  if (!conditions.length) {
    return Prisma.sql`TRUE`
  }
  return conditions.reduce((left, right) => Prisma.sql`${left} AND ${right}`)
}
